package __PACKAGE_NAME__;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Lightweight WebView shell for a single MobiShop public store URL.
 */
public class MainActivity extends AppCompatActivity {

    private static final int FILE_CHOOSER_REQUEST = 1001;

    private WebView webView;
    private ProgressBar progressBar;
    private LinearLayout offlinePanel;
    private ValueCallback<Uri[]> filePathCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        progressBar = findViewById(R.id.progress);
        offlinePanel = findViewById(R.id.offline_panel);
        Button retry = findViewById(R.id.retry_button);

        try {
            int color = Color.parseColor(BuildConfig.PRIMARY_COLOR);
            progressBar.getIndeterminateDrawable().setTint(color);
            findViewById(R.id.splash_bar).setBackgroundColor(color);
        } catch (Exception ignored) {
        }

        setupWebView();
        retry.setOnClickListener(v -> loadStore());

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        loadStore();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView() {
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                progressBar.setVisibility(View.VISIBLE);
                offlinePanel.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
                findViewById(R.id.splash).setVisibility(View.GONE);
                injectStoreOnlyGuard(view);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showOffline();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
    }

    private void injectStoreOnlyGuard(WebView view) {
        Uri store = Uri.parse(BuildConfig.STORE_URL);
        String path = store.getPath();
        if (path == null) return;
        while (path.endsWith("/")) {
            path = path.substring(0, path.length() - 1);
        }
        int q = path.indexOf('?');
        if (q >= 0) {
            path = path.substring(0, q);
        }
        final String prefix = path;
        String js =
                "(function(){"
                        + "var prefix=" + org.json.JSONObject.quote(prefix) + ";"
                        + "function blocked(href){"
                        + "if(!href||href.indexOf('javascript:')===0||href.indexOf('#')===0)return false;"
                        + "if(href.indexOf('tel:')===0||href.indexOf('mailto:')===0||href.indexOf('whatsapp:')===0"
                        + "||href.indexOf('sms:')===0||href.indexOf('geo:')===0)return false;"
                        + "if(href.indexOf('wa.me')>=0||href.indexOf('maps.google')>=0||href.indexOf('goo.gl/maps')>=0)return false;"
                        + "try{var u=new URL(href,location.origin);"
                        + "var p=u.pathname||'';"
                        + "while(p.endsWith('/'))p=p.slice(0,-1);"
                        + "if(p.indexOf('/login')===0||p.indexOf('/marketplace')===0||p.indexOf('/product/')===0)return true;"
                        + "return !(p===prefix||p.indexOf(prefix+'/')===0);"
                        + "}catch(e){return true;}"
                        + "}"
                        + "document.addEventListener('click',function(e){"
                        + "var a=e.target;while(a&&a.tagName!=='A')a=a.parentElement;if(!a||!a.href)return;"
                        + "if(blocked(a.getAttribute('href')||a.href)){e.preventDefault();e.stopPropagation();}"
                        + "},true);"
                        + "})();";
        view.evaluateJavascript(js, null);
    }

    private boolean handleUrl(String url) {
        if (url == null) return true;
        String lower = url.toLowerCase();
        if (lower.startsWith("tel:") || lower.startsWith("mailto:")
                || lower.startsWith("whatsapp:") || lower.startsWith("sms:")
                || lower.contains("wa.me") || lower.contains("maps.google")
                || lower.contains("goo.gl/maps") || lower.startsWith("geo:")) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (ActivityNotFoundException ignored) {
            }
            return true;
        }
        if (URLUtil.isNetworkUrl(url)) {
            if (isAllowedStoreUrl(url)) {
                return false;
            }
            return true;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
        }
        return true;
    }

    /** Only /shop/{slug}/... on the same host as the configured store URL. */
    private boolean isAllowedStoreUrl(String url) {
        try {
            Uri target = Uri.parse(url);
            Uri store = Uri.parse(BuildConfig.STORE_URL);
            if (target.getHost() == null || store.getHost() == null) return false;
            if (!target.getHost().equalsIgnoreCase(store.getHost())) return false;
            String tPath = target.getPath() != null ? target.getPath() : "";
            while (tPath.endsWith("/")) {
                tPath = tPath.substring(0, tPath.length() - 1);
            }
            String sPath = store.getPath() != null ? store.getPath() : "";
            while (sPath.endsWith("/")) {
                sPath = sPath.substring(0, sPath.length() - 1);
            }
            int q = sPath.indexOf('?');
            if (q >= 0) {
                sPath = sPath.substring(0, q);
            }
            if (tPath.startsWith("/login")
                    || tPath.startsWith("/marketplace")
                    || tPath.startsWith("/product/")) {
                return false;
            }
            return tPath.equals(sPath) || tPath.startsWith(sPath + "/") || tPath.startsWith(sPath + "?");
        } catch (Exception ignored) {
            return false;
        }
    }

    private void loadStore() {
        if (!isOnline()) {
            showOffline();
            return;
        }
        offlinePanel.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        webView.loadUrl(BuildConfig.STORE_URL);
    }

    private void showOffline() {
        progressBar.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        offlinePanel.setVisibility(View.VISIBLE);
        findViewById(R.id.splash).setVisibility(View.GONE);
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && (
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
                        || caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)
                        || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        );
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (filePathCallback == null) return;
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
