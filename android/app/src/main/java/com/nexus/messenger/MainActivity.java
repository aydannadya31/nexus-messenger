package com.nexus.messenger;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_CODE = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Sesli/goruntulu arama ve galeri secimi icin izinleri ilk acilista iste.
        // Verilmeden WebView getUserMedia calismaz.
        requestRuntimePermissions();

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

    private void requestRuntimePermissions() {
        List<String> perms = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.RECORD_AUDIO);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            perms.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= 33) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES)
                    != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_VIDEO)
                    != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_MEDIA_VIDEO);
            }
        } else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
                    != PackageManager.PERMISSION_GRANTED) {
                perms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
            }
        }
        if (!perms.isEmpty()) {
            ActivityCompat.requestPermissions(this, perms.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }
}
