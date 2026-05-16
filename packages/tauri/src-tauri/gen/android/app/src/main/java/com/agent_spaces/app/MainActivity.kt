package com.agent_spaces.app

import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.WindowCompat

class MainActivity : TauriActivity() {
    private var statusBarTheme = "light"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        statusBarTheme = if (isSystemDarkTheme()) "dark" else "light"
        WindowCompat.setDecorFitsSystemWindows(window, false)
        applyStatusBarTheme(statusBarTheme)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        webView.addJavascriptInterface(StatusBarBridge(this), "AgentSpacesStatusBar")
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        applyStatusBarTheme(statusBarTheme)
    }

    fun applyStatusBarTheme(theme: String) {
        val isDark = theme == "dark"
        statusBarTheme = if (isDark) "dark" else "light"
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        val insetsController = WindowCompat.getInsetsController(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = !isDark
        insetsController.isAppearanceLightNavigationBars = !isDark
    }

    private fun isSystemDarkTheme(): Boolean {
        return (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }

    class StatusBarBridge(private val activity: MainActivity) {
        @JavascriptInterface
        fun setTheme(theme: String) {
            activity.runOnUiThread {
                activity.applyStatusBarTheme(theme)
            }
        }

        @JavascriptInterface
        fun getTopInset(): Float {
            val resourceId = activity.resources.getIdentifier("status_bar_height", "dimen", "android")
            if (resourceId <= 0) return 0f

            val heightPx = activity.resources.getDimensionPixelSize(resourceId)
            return heightPx / activity.resources.displayMetrics.density
        }
    }
}
