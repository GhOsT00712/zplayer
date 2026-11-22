package io.zplayer.android

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * ZPLAYER's Android window (A3).
 * - Full screen: the app draws edge to edge and hides the status bar. A swipe down from the top
 *   shows it for a moment. The gesture bar stays, drawn over the app.
 * - Tells the web UI how tall the gesture bar is (window.ZpInsets.bottom(), plus a "zp-insets"
 *   event when it changes), so the mini player and lists clear it.
 * - Lock screen: when the screen turns off while a song plays, the app is allowed to show over
 *   Android's lock screen and the web UI switches to the album wall (window.zpLock()). Swiping up
 *   there calls ZpLock.unlock(), which hands over to Android's own unlock (PIN, fingerprint).
 *   This works while ZPLAYER is the app on screen; from the background it needs A4's media service.
 * - Playback through the Spotify app: SpotifyRemote.kt, exposed to the page as window.ZpRemote.
 * - The back gesture is handled by Tauri's onBackButtonPress in the web UI.
 * See frontend/src/platform/android.ts and frontend/src/mock/App.tsx for the web side.
 */
class MainActivity : TauriActivity() {
  @Volatile private var insetBottom = 0f
  @Volatile private var playing = false
  private var webView: WebView? = null
  private var spotifyRemote: SpotifyRemote? = null

  private val screenOff = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (!playing) return
      showOverLockScreen(true)
      webView?.post { webView?.evaluateJavascript("window.zpLock && window.zpLock()", null) }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      // draw under the camera cutout too: the design runs to the very top edge
      window.attributes = window.attributes.apply {
        layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      }
    }
    hideStatusBar()
    ContextCompat.registerReceiver(this, screenOff, IntentFilter(Intent.ACTION_SCREEN_OFF), ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  @Deprecated("Spotify's auth library still returns its result here")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == SpotifyRemote.AUTH_REQUEST) spotifyRemote?.onAuthResult(resultCode, data)
  }

  private val onRemoveTask: () -> Unit = { releasePlayer(pausePlayback = true) }

  override fun onStart() {
    super.onStart()
    PlaybackExitService.onRemoveTask = onRemoveTask
    startService(Intent(this, PlaybackExitService::class.java))
  }

  override fun onDestroy() {
    releasePlayer(pausePlayback = isFinishing)
    unregisterReceiver(screenOff)
    super.onDestroy()
  }

  private fun releasePlayer(pausePlayback: Boolean) {
    fun stopExitService() {
      if (PlaybackExitService.onRemoveTask === onRemoveTask) {
        PlaybackExitService.onRemoveTask = null
        stopService(Intent(this, PlaybackExitService::class.java))
      }
    }
    val player = spotifyRemote
    if (player == null) stopExitService() else player.release(pausePlayback, ::stopExitService)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideStatusBar()
  }

  private fun hideStatusBar() {
    WindowCompat.getInsetsController(window, window.decorView).apply {
      hide(WindowInsetsCompat.Type.statusBars())
      systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    }
  }

  private fun showOverLockScreen(show: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(show)
    } else {
      @Suppress("DEPRECATION")
      if (show) window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
      else window.clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    // playback through the Spotify app (A4): window.ZpRemote in the page
    spotifyRemote = SpotifyRemote(this, webView).also { webView.addJavascriptInterface(it, "ZpRemote") }
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun bottom(): Float = insetBottom
    }, "ZpInsets")
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun setPlaying(value: Boolean) { playing = value }
      @JavascriptInterface fun unlock() {
        runOnUiThread {
          showOverLockScreen(false)
          val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
          if (keyguard.isKeyguardLocked && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            keyguard.requestDismissKeyguard(this@MainActivity, null)
          }
        }
      }
    }, "ZpLock")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val nav = insets.getInsets(WindowInsetsCompat.Type.navigationBars())
      val next = nav.bottom / resources.displayMetrics.density
      if (next != insetBottom) {
        insetBottom = next
        webView.post { webView.evaluateJavascript("window.dispatchEvent(new Event('zp-insets'))", null) }
      }
      insets
    }
  }
}
