package com.nexus.messenger;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            String ua = getBridge().getWebView().getSettings().getUserAgentString();
            getBridge().getWebView().getSettings().setUserAgentString(ua.replace("wv", ""));
        }
    }
}
