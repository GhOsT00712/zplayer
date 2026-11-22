package io.zplayer.android

import android.app.Service
import android.content.Intent
import android.os.IBinder

/** Android can remove a background task before its activity receives onDestroy. */
class PlaybackExitService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int) = START_NOT_STICKY

  override fun onTaskRemoved(rootIntent: Intent?) {
    val close = onRemoveTask
    if (close != null) close() else stopSelf()
  }

  companion object {
    var onRemoveTask: (() -> Unit)? = null
  }
}
