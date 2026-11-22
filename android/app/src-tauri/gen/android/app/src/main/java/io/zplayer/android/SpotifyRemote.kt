package io.zplayer.android

import android.app.Activity
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.spotify.android.appremote.api.ConnectionParams
import com.spotify.android.appremote.api.Connector
import com.spotify.android.appremote.api.SpotifyAppRemote
import com.spotify.android.appremote.api.error.UserNotAuthorizedException
import com.spotify.protocol.client.CallResult
import com.spotify.protocol.client.Subscription
import com.spotify.protocol.types.ListItem
import com.spotify.protocol.types.PlayerContext
import com.spotify.protocol.types.PlayerState
import com.spotify.sdk.android.auth.AuthorizationClient
import com.spotify.sdk.android.auth.AuthorizationRequest
import com.spotify.sdk.android.auth.AuthorizationResponse
import org.json.JSONObject
import org.json.JSONArray

/**
 * Playback through the Spotify app (A4 step 2), using Spotify's App Remote SDK 0.8.0.
 * The web UI calls these methods as window.ZpRemote.*; results and the player state come back as
 * window.zpRemoteEvent({ type, ... }). See frontend/src/spotify/useSpotifyPlayer.ts.
 *
 * Events: { type: "connected" }, { type: "disconnected", code, message }, { type: "error", code,
 * message }, { type: "state", ...the player state }, { type: "library", uri, added, canAdd },
 * { type: "authorizing" }.
 *
 * Allowing ZPLAYER: the first connection needs your OK in the Spotify app. App Remote's own prompt
 * (showAuthView) is started by Spotify's background service, which current Android versions block
 * from opening screens. So when Spotify answers UserNotAuthorizedException, ZPLAYER opens Spotify's
 * consent screen itself with the Spotify auth library (scope app-remote-control), then connects again.
 */
class SpotifyRemote(private val activity: Activity, private val webView: WebView) {
  private var remote: SpotifyAppRemote? = null
  private var stateSubscription: Subscription<PlayerState>? = null
  private var contextSubscription: Subscription<PlayerContext>? = null
  private var contextUri: String? = null
  private var selection = 0L
  private var connecting = false
  private var clientId: String? = null
  private var askedToAuthorize = false
  private var released = false
  private var isPlaying = false

  @JavascriptInterface fun installed(): Boolean = SpotifyAppRemote.isSpotifyInstalled(activity)

  @JavascriptInterface fun connect(clientId: String) {
    this.clientId = clientId
    activity.runOnUiThread {
      if (released) return@runOnUiThread
      if (remote?.isConnected == true) { emit(JSONObject().put("type", "connected")); refreshState(); return@runOnUiThread }
      if (connecting) return@runOnUiThread
      connecting = true
      // showAuthView: the first time, the Spotify app asks you to allow ZPLAYER to control it
      val params = ConnectionParams.Builder(clientId).setRedirectUri(REDIRECT).showAuthView(true).build()
      SpotifyAppRemote.connect(activity, params, object : Connector.ConnectionListener {
        override fun onConnected(appRemote: SpotifyAppRemote) {
          connecting = false
          if (released) { SpotifyAppRemote.disconnect(appRemote); return }
          remote = appRemote
          stateSubscription?.cancel()
          stateSubscription = appRemote.playerApi.subscribeToPlayerState().setEventCallback { state -> emitState(state) }
          contextSubscription?.cancel()
          contextSubscription = appRemote.playerApi.subscribeToPlayerContext().setEventCallback { contextUri = it.uri }
          emit(JSONObject().put("type", "connected"))
        }

        override fun onFailure(error: Throwable) {
          connecting = false
          if (released) return
          val wasConnected = remote != null
          remote = null
          // not allowed yet: ask once, from this screen (see the note at the top)
          if (error is UserNotAuthorizedException && !askedToAuthorize) {
            askedToAuthorize = true
            clientId?.let { authorize(it) }
            return
          }
          emit(JSONObject().put("type", if (wasConnected) "disconnected" else "error")
            .put("code", error.javaClass.simpleName).put("message", error.message ?: ""))
        }
      })
    }
  }

  /** Opens Spotify's "allow ZPLAYER" screen (in the Spotify app). The answer comes to onAuthResult. */
  @JavascriptInterface fun authorize(clientId: String) {
    this.clientId = clientId
    activity.runOnUiThread {
      emit(JSONObject().put("type", "authorizing"))
      // TOKEN: since auth 2.2 the library runs this with PKCE against the Spotify app, which current
      // Spotify apps require (the old non-PKCE request was refused with AUTHENTICATION_SERVICE_UNAVAILABLE).
      // ZPLAYER only needs the consent; the token itself is not used.
      val request = AuthorizationRequest.Builder(clientId, AuthorizationResponse.Type.TOKEN, REDIRECT)
        .setScopes(arrayOf("app-remote-control"))
        .build()
      AuthorizationClient.openLoginActivity(activity, AUTH_REQUEST, request)
    }
  }

  /** Called by MainActivity with the result of [authorize]. */
  fun onAuthResult(resultCode: Int, data: Intent?) {
    askedToAuthorize = false
    val response = AuthorizationClient.getResponse(resultCode, data)
    when (response.type) {
      AuthorizationResponse.Type.CODE, AuthorizationResponse.Type.TOKEN -> clientId?.let { connect(it) }
      AuthorizationResponse.Type.ERROR -> emit(JSONObject().put("type", "error").put("code", "AuthorizationFailed").put("message", response.error ?: ""))
      else -> emit(JSONObject().put("type", "error").put("code", "AuthorizationCancelled").put("message", ""))
    }
  }

  @JavascriptInterface fun disconnect() {
    activity.runOnUiThread {
      selection++
      contextSubscription?.cancel()
      contextSubscription = null
      contextUri = null
      stateSubscription?.cancel()
      stateSubscription = null
      remote?.let { SpotifyAppRemote.disconnect(it) }
      remote = null
    }
  }

  /** Called on the UI thread when the activity is destroyed. Keep the connection until Spotify
   * acknowledges the final pause, or briefly times out if the Spotify app has gone away. */
  fun release(pausePlayback: Boolean, onReleased: () -> Unit) {
    if (released) return
    released = true
    val connected = remote
    if (connected == null || !pausePlayback || !isPlaying || !connected.isConnected) {
      disconnect()
      onReleased()
      return
    }
    stateSubscription?.cancel()
    stateSubscription = null
    val handler = Handler(Looper.getMainLooper())
    val cleanup = Runnable {
      if (remote === connected) {
        disconnect()
        onReleased()
      }
    }
    handler.postDelayed(cleanup, 2000)
    fun finishPause() {
      handler.removeCallbacks(cleanup)
      cleanup.run()
    }
    connected.playerApi.pause().setResultCallback { finishPause() }.setErrorCallback { finishPause() }
  }

  /** Plays a track, album, playlist or artist URI. */
  @JavascriptInterface fun play(uri: String) = call("play") { selection++; it.playerApi.play(uri) }
  /** Spotify accepts indexed playback for albums and playlists. */
  @JavascriptInterface fun playAt(contextUri: String, index: Int) = call("playAt") {
    selection++
    it.playerApi.skipToIndex(contextUri, index)
  }

  /** Queue entries lack collection positions. Resolve the track in the playing collection
   * before jumping, so Spotify keeps the full playlist, including tracks beyond the queue preview. */
  @JavascriptInterface fun playTracks(tracksJson: String, fromQueue: Boolean, source: String) {
    activity.runOnUiThread {
      val app = remote
      if (app == null || !app.isConnected) {
        emit(JSONObject().put("type", "error").put("code", "NotConnected").put("message", ""))
        return@runOnUiThread
      }
      val items = JSONArray(tracksJson)
      if (items.length() == 0) return@runOnUiThread
      val request = ++selection
      val uri = items.getString(0)
      fun current() = selection == request && !released && remote === app
      fun failed(error: Throwable) {
        if (current()) emit(JSONObject().put("type", "error").put("code", error.javaClass.simpleName)
          .put("call", "play").put("message", error.message ?: ""))
      }
      fun queueAfter(index: Int) {
        if (!current() || index >= items.length()) return
        app.playerApi.queue(items.getString(index)).setResultCallback { queueAfter(index + 1) }.setErrorCallback(::failed)
      }
      fun playSequence() {
        if (current()) app.playerApi.play(uri).setResultCallback { queueAfter(1) }.setErrorCallback(::failed)
      }
      val context = if (fromQueue) contextUri.orEmpty() else source
      if (context.isEmpty()) {
        playSequence()
        return@runOnUiThread
      }
      val parent = ListItem(context, context, null, "", "", false, true)
      fun findTrack(offset: Int) {
        if (!current()) return
        app.contentApi.getChildrenOfItem(parent, 100, offset).setResultCallback { page ->
          if (!current()) return@setResultCallback
          val index = page.items.indexOfFirst { it.uri == uri }
          val next = offset + page.items.size
          when {
            index >= 0 -> if (context.endsWith(":collection")) {
              app.contentApi.playContentItem(page.items[index]).setErrorCallback(::failed)
            } else app.playerApi.skipToIndex(context, offset + index).setErrorCallback(::failed)
            next > offset && next < page.total -> findTrack(next)
            else -> playSequence()
          }
        }.setErrorCallback { playSequence() }
      }
      findTrack(0)
    }
  }
  @JavascriptInterface fun pause() = call("pause") { it.playerApi.pause() }
  @JavascriptInterface fun resume() = call("resume") { it.playerApi.resume() }
  @JavascriptInterface fun next() = call("next") { it.playerApi.skipNext() }
  @JavascriptInterface fun previous() = call("previous") { it.playerApi.skipPrevious() }
  @JavascriptInterface fun seek(positionMs: Double) = call("seek") { it.playerApi.seekTo(positionMs.toLong()) }
  @JavascriptInterface fun setShuffle(on: Boolean) = call("shuffle") { it.playerApi.setShuffle(on) }
  /** 0 off, 1 one song, 2 all. */
  @JavascriptInterface fun setRepeat(mode: Int) = call("repeat") { it.playerApi.setRepeat(mode) }
  @JavascriptInterface fun like(uri: String, on: Boolean) =
    call("like") { if (on) it.userApi.addToLibrary(uri) else it.userApi.removeFromLibrary(uri) }

  @JavascriptInterface fun libraryState(uri: String) {
    activity.runOnUiThread {
      remote?.userApi?.getLibraryState(uri)?.setResultCallback { state ->
        emit(JSONObject().put("type", "library").put("uri", state.uri).put("added", state.isAdded).put("canAdd", state.canAdd))
      }
    }
  }

  @JavascriptInterface fun refreshState() {
    activity.runOnUiThread { remote?.playerApi?.playerState?.setResultCallback { state -> emitState(state) } }
  }

  private fun <T> call(name: String, action: (SpotifyAppRemote) -> CallResult<T>) {
    activity.runOnUiThread {
      val connected = remote
      if (connected == null || !connected.isConnected) {
        emit(JSONObject().put("type", "error").put("code", "NotConnected").put("message", "Not connected to the Spotify app."))
        return@runOnUiThread
      }
      action(connected).setErrorCallback { error ->
        emit(JSONObject().put("type", "error").put("code", error.javaClass.simpleName).put("call", name).put("message", error.message ?: ""))
      }
    }
  }

  private fun emitState(state: PlayerState) {
    val track = state.track
    isPlaying = track != null && !state.isPaused
    val json = JSONObject().put("type", "state")
      .put("paused", state.isPaused)
      .put("positionMs", state.playbackPosition)
      .put("at", System.currentTimeMillis())
      .put("shuffle", state.playbackOptions?.isShuffling ?: false)
      .put("repeat", state.playbackOptions?.repeatMode ?: 0)
      .put("canSeek", state.playbackRestrictions?.canSeek ?: true)
      .put("canSkipNext", state.playbackRestrictions?.canSkipNext ?: true)
      .put("canSkipPrev", state.playbackRestrictions?.canSkipPrev ?: true)
    if (track != null) {
      json.put("track", JSONObject()
        .put("uri", track.uri)
        .put("name", track.name)
        .put("artist", track.artist?.name ?: "")
        .put("artistUri", track.artist?.uri ?: "")
        .put("artists", track.artists?.joinToString(", ") { it.name } ?: (track.artist?.name ?: ""))
        .put("album", track.album?.name ?: "")
        .put("albumUri", track.album?.uri ?: "")
        .put("durationMs", track.duration)
        .put("image", track.imageUri?.raw ?: "")
        .put("isEpisode", track.isEpisode))
    }
    emit(json)
  }

  private fun emit(event: JSONObject) {
    webView.post { webView.evaluateJavascript("window.zpRemoteEvent && window.zpRemoteEvent($event)", null) }
  }

  companion object {
    /** The same redirect URI as the Web API sign-in; it's in the Spotify dashboard. */
    const val REDIRECT = "io.zplayer.android://callback"
    const val AUTH_REQUEST = 4242
  }
}
