package com.nexus.messenger;

import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();

            // Firebase Auth'in Google akisi firebaseapp.com uzerinden calisir (capraz-kaynak
            // cerceve + cerez). Android WebView ucuncu taraf cerezleri varsayilan olarak
            // kapatiyor ve akis "auth/network-request-failed" ile duser.
            CookieManager cookies = CookieManager.getInstance();
            cookies.setAcceptCookie(true);
            cookies.setAcceptThirdPartyCookies(webView, true);
            settings.setDomStorageEnabled(true);

            // Google, gomulu WebView'larda OAuth'u "Version/4.0" ve "wv" isaretlerinden taniyor.
            // UA'yi normal Chrome'a benzetiyoruz; "NexusApp" isareti native tespiti icin.
            String ua = settings.getUserAgentString()
                .replace("wv", "")
                .replace("Version/4.0", "Chrome/120.0.0.0");
            settings.setUserAgentString(ua + " NexusApp");
        }
    }
}
