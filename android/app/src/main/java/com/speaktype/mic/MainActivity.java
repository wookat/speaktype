package com.speaktype.mic;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * SpeakType 手机麦克风
 *
 * 只是把中转服务托管的手机端页面装进一个 WebView：按住说话，音频经中转直通电脑，
 * 文字落到电脑光标处。配对码存在网页的 localStorage 里，换电脑在页面内重新配对即可。
 */
public class MainActivity extends AppCompatActivity {

  private static final String DEFAULT_SERVER = "https://speaktype-relay.wookat520.workers.dev";
  private static final String PREFS = "speaktype";
  private static final String KEY_SERVER = "server";

  private WebView web;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

    web = new WebView(this);
    setContentView(web);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);

    web.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        // 页面申请麦克风/相机时，先确保应用自身已拿到系统权限，再放行
        runOnUiThread(() -> {
          if (hasPermissions()) request.grant(request.getResources());
          else {
            request.deny();
            requestPermissions();
          }
        });
      }
    });

    web.setWebViewClient(new WebViewClient() {
      @Override
      public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) askServer(true);
      }
    });

    // 长按空白处可改中转地址（自部署 Worker 的用户用）
    web.setOnLongClickListener(v -> {
      askServer(false);
      return true;
    });

    requestPermissions();
    web.loadUrl(server() + "/app");
  }

  private String server() {
    SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
    return p.getString(KEY_SERVER, DEFAULT_SERVER);
  }

  private void askServer(boolean failed) {
    EditText input = new EditText(this);
    input.setText(server());
    new AlertDialog.Builder(this)
        .setTitle(failed ? R.string.load_failed : R.string.server_title)
        .setMessage(R.string.server_hint)
        .setView(input)
        .setPositiveButton(android.R.string.ok, (d, w) -> {
          String url = input.getText().toString().trim().replaceAll("/+$", "");
          if (url.isEmpty()) return;
          if (!url.startsWith("http")) url = "https://" + url;
          getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_SERVER, url).apply();
          web.loadUrl(url + "/app");
        })
        .setNegativeButton(android.R.string.cancel, null)
        .show();
  }

  private boolean hasPermissions() {
    return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
        == PackageManager.PERMISSION_GRANTED;
  }

  private void requestPermissions() {
    ActivityCompat.requestPermissions(
        this, new String[] {Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA}, 1);
  }

  @Override
  public void onRequestPermissionsResult(
      int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == 1 && hasPermissions()) web.reload();
  }

  @Override
  public void onBackPressed() {
    if (web.canGoBack()) web.goBack();
    else super.onBackPressed();
  }

  @Override
  protected void onDestroy() {
    ((View) web.getParent()).setKeepScreenOn(false);
    web.destroy();
    super.onDestroy();
  }
}
