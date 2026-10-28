package com.nexus.messenger;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        WebView webView = bridge.getWebView();
        WebSettings settings = webView.getSettings();

        // Firebase Auth'in Google akisi firebaseapp.com uzerinden calisir (capraz-kaynak
        // cerceve + cerez). Android WebView ucuncu taraf cerezleri varsayilan olarak
        // kapatiyor ve akis "auth/network-request-failed" ile duser.
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);
        settings.setDomStorageEnabled(true);

        // Capacitor'in varsayilan WebViewClient'i allowNavigation listesinde olmayan
        // her adresi dis tarayiciya firlatir; Google girisi bu yuzden APK'dan cikiyordu.
        // Burada http/https adresler WebView icinde tutulur, sadece diger semalar (tel,
        // mailto, intent) disari acilir.
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String scheme = url.getScheme();
                if (scheme == null) {
                    return false;
                }
                if ("http".equals(scheme) || "https".equals(scheme)) {
                    return false;
                }
                return bridge.launchIntent(url);
            }
        });
    }
}
