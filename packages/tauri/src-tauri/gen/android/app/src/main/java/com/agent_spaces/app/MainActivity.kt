package com.agent_spaces.app

import android.content.res.Configuration
import android.graphics.Color
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.view.WindowCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
    private var statusBarTheme = "light"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        statusBarTheme = if (isSystemDarkTheme()) "dark" else "light"
        applyStatusBarTheme(statusBarTheme)

        val content = findViewById<android.view.View>(android.R.id.content)
        ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
            val systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom)
            insets
        }
        ViewCompat.requestApplyInsets(content)
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
        window.statusBarColor = Color.parseColor(if (isDark) "#0f1117" else "#ffffff")
        WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = !isDark
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
    }
}
