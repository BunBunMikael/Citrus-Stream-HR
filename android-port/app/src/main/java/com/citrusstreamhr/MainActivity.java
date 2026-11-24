package com.citrusstreamhr;

import android.app.Dialog;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import org.libsdl.app.SDLActivity;

public class MainActivity extends SDLActivity {
    private interface BoolChange { void accept(boolean value); }
    private interface IntChange { void accept(int value); }

    private static WifiManager.WifiLock wifiLock;
    private TextView connectionStatus;
    private Button connectionButton;

    private static native String nativeGetIp();
    private static native String nativeGetViewerIp();
    private static native String nativeGetStatus();
    private static native String nativeAutoDetect();
    private static native void nativeRefreshNetwork();
    private static native int nativeGetQuality();
    private static native int nativeGetBandwidth();
    private static native int nativeGetCompression();
    private static native int nativeGetPort();
    private static native int nativeGetPriorityFactor();
    private static native boolean nativeGetTopPriority();
    private static native boolean nativeGetAutoQuality();
    private static native boolean nativeGetAudio();
    private static native boolean nativeGetFullWidth();
    private static native boolean nativeGetAutoReconnect();
    private static native boolean nativeGetStats();
    private static native void nativeSetIp(String ip);
    private static native void nativeSetQuality(int quality);
    private static native void nativeSetBandwidth(int bandwidth);
    private static native void nativeSetCompression(int mode);
    private static native void nativeSetPort(int port);
    private static native void nativeSetPriority(boolean top, int factor);
    private static native void nativeSetAutoQuality(boolean enabled);
    private static native void nativeSetAudio(boolean enabled);
    private static native void nativeSetFullWidth(boolean enabled);
    private static native void nativeSetAutoReconnect(boolean enabled);
    private static native void nativeSetStats(boolean enabled);
    private static native void nativeConnect();
    private static native void nativeDisconnect();
    private static native void nativeResetDefaults();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        acquireWifiLock();
        addSettingsButton();
    }

    private void acquireWifiLock() {
        try {
            WifiManager manager = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (manager == null) return;
            int mode = Build.VERSION.SDK_INT >= 29
                    ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                    : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = manager.createWifiLock(mode, "CitrusStreamHR:stream");
            wifiLock.setReferenceCounted(false);
            wifiLock.acquire();
        } catch (Exception ignored) {
            // Streaming still works if the device does not grant a Wi-Fi performance lock.
        }
    }

    @Override
    protected void onDestroy() {
        if (wifiLock != null && wifiLock.isHeld()) {
            wifiLock.release();
        }
        wifiLock = null;
        super.onDestroy();
    }

    private void addSettingsButton() {
        ViewGroup decor = mLayout != null ? mLayout : (ViewGroup) getWindow().getDecorView();
        Button button = new Button(this);
        button.setText("⚙ Settings");
        button.setAllCaps(false);
        button.setTextSize(13);
        button.setElevation(dp(8));
        button.setOnClickListener(v -> showSettings());
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, dp(46), Gravity.TOP | Gravity.END);
        params.setMargins(0, dp(24), dp(12), 0);
        decor.addView(button, params);
    }

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable panelBackground() {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(Color.rgb(20, 25, 34));
        shape.setCornerRadius(dp(18));
        return shape;
    }

    private TextView text(String value, float size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(Color.WHITE);
        view.setTextSize(size);
        if (bold) view.setTypeface(null, android.graphics.Typeface.BOLD);
        view.setPadding(0, dp(5), 0, dp(5));
        return view;
    }

    private LinearLayout column() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(18), dp(12), dp(18), dp(22));
        layout.setBackground(panelBackground());
        return layout;
    }

    private void addSection(LinearLayout parent, String heading) {
        TextView title = text(heading, 17, true);
        title.setPadding(0, dp(16), 0, dp(7));
        parent.addView(title);
    }

    private void addSwitch(LinearLayout parent, String label, boolean initial, BoolChange changed) {
        CheckBox check = new CheckBox(this);
        check.setText(label);
        check.setTextColor(Color.WHITE);
        check.setTextSize(15);
        check.setButtonTintList(android.content.res.ColorStateList.valueOf(Color.rgb(100, 180, 255)));
        check.setChecked(initial);
        check.setMinHeight(dp(48));
        check.setOnCheckedChangeListener((button, checked) -> changed.accept(checked));
        parent.addView(check);
    }

    private void addSlider(LinearLayout parent, String label, int min, int max, int value, IntChange changed) {
        TextView valueLabel = text(label + "  ·  " + value, 14, false);
        parent.addView(valueLabel);
        SeekBar bar = new SeekBar(this);
        bar.setMax(max - min);
        bar.setProgress(Math.max(0, Math.min(max - min, value - min)));
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                int selected = min + progress;
                valueLabel.setText(label + "  ·  " + selected);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) { }
            @Override public void onStopTrackingTouch(SeekBar seekBar) {
                changed.accept(min + seekBar.getProgress());
            }
        });
        parent.addView(bar);
    }

    private EditText edit(String value, int inputType, String hint) {
        EditText field = new EditText(this);
        field.setSingleLine(true);
        field.setText(value);
        field.setHint(hint);
        field.setTextColor(Color.WHITE);
        field.setHintTextColor(Color.LTGRAY);
        field.setTextSize(16);
        field.setInputType(inputType);
        field.setPadding(dp(12), dp(8), dp(12), dp(8));
        return field;
    }

    private Button actionButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setAllCaps(false);
        return button;
    }

    private void refreshConnection() {
        String status = nativeGetStatus();
        if (connectionStatus != null) connectionStatus.setText("Connection: " + status);
        if (connectionButton != null) connectionButton.setText(status.equals("Connected") ? "Disconnect" : "Connect");
    }

    private void showSettings() {
        Dialog dialog = new Dialog(this);
        ScrollView scroll = new ScrollView(this);
        LinearLayout content = column();
        scroll.setFillViewport(false);
        scroll.setBackgroundColor(Color.rgb(20, 25, 34));
        scroll.addView(content);

        content.addView(text("Remote Play", 23, true));
        connectionStatus = text("Connection: " + nativeGetStatus(), 15, false);
        content.addView(connectionStatus);

        connectionButton = actionButton(nativeGetStatus().equals("Connected") ? "Disconnect" : "Connect");
        connectionButton.setOnClickListener(v -> {
            if (nativeGetStatus().equals("Connected")) nativeDisconnect();
            else nativeConnect();
            connectionButton.postDelayed(this::refreshConnection, 250);
            connectionButton.postDelayed(this::refreshConnection, 1000);
        });
        content.addView(connectionButton);

        addSection(content, "Connection");
        content.addView(text("3DS IP address", 14, false));
        EditText ipField = edit(nativeGetIp(), InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS,
                "192.168.1.100");
        content.addView(ipField);
        Button detect = actionButton("Auto-detect 3DS");
        detect.setOnClickListener(v -> {
            String detected = nativeAutoDetect();
            ipField.setText(detected);
            Toast.makeText(this, "Detected address: " + detected, Toast.LENGTH_SHORT).show();
        });
        content.addView(detect);
        content.addView(text("Viewer network interface", 14, false));
        TextView viewerIp = text(nativeGetViewerIp(), 14, false);
        content.addView(viewerIp);
        Button refreshNetwork = actionButton("Refresh network interfaces");
        refreshNetwork.setOnClickListener(v -> {
            nativeRefreshNetwork();
            viewerIp.setText(nativeGetViewerIp());
        });
        content.addView(refreshNetwork);

        EditText portField = edit(Integer.toString(nativeGetPort()), InputType.TYPE_CLASS_NUMBER, "8001");
        content.addView(text("Viewer UDP port", 14, false));
        content.addView(portField);

        addSection(content, "Video quality");
        addSlider(content, "JPEG quality", 10, 100, nativeGetQuality(), MainActivity::nativeSetQuality);
        addSwitch(content, "Automatic quality adjustment", nativeGetAutoQuality(), MainActivity::nativeSetAutoQuality);
        addSlider(content, "Bandwidth limit (Mbps)", 4, 20, nativeGetBandwidth(), MainActivity::nativeSetBandwidth);
        content.addView(text("Compression format and protocol", 14, false));
        Spinner compression = new Spinner(this);
        String[] formats = {
                "JPEG Compat (UDP)",
                "JPEG (Reliable Stream)",
                "JPEG (Reliable Stream, Delta)",
                "Uncompressed (UDP)",
                "Lossless (Reliable Stream)",
                "Lossless (Reliable Stream, Delta)"
        };
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, formats);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        compression.setAdapter(adapter);
        compression.setSelection(Math.max(0, Math.min(formats.length - 1, nativeGetCompression())));
        compression.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                nativeSetCompression(position);
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) { }
        });
        content.addView(compression);

        addSection(content, "Screen and extras");
        addSwitch(content, "Prioritize top screen", nativeGetTopPriority(), enabled ->
                nativeSetPriority(enabled, nativeGetPriorityFactor()));
        addSlider(content, "Priority screen factor", 0, 255, nativeGetPriorityFactor(), value ->
                nativeSetPriority(nativeGetTopPriority(), value));
        addSwitch(content, "Full Width (NTR-HR+)", nativeGetFullWidth(), MainActivity::nativeSetFullWidth);
        addSwitch(content, "Game audio (NTR-HR+)", nativeGetAudio(), MainActivity::nativeSetAudio);
        addSwitch(content, "Auto-reconnect", nativeGetAutoReconnect(), MainActivity::nativeSetAutoReconnect);
        addSwitch(content, "Show streaming statistics", nativeGetStats(), MainActivity::nativeSetStats);

        addSection(content, "Apply");
        Button apply = actionButton("Apply connection settings");
        apply.setOnClickListener(v -> {
            String ip = ipField.getText().toString().trim();
            String portText = portField.getText().toString().trim();
            int port;
            try {
                String[] parts = ip.split("\\.");
                if (parts.length != 4) throw new IllegalArgumentException();
                for (String part : parts) {
                    int octet = Integer.parseInt(part);
                    if (octet < 0 || octet > 255) throw new IllegalArgumentException();
                }
                port = Integer.parseInt(portText);
                if (port < 1024 || port > 65535) throw new IllegalArgumentException();
            } catch (Exception invalid) {
                Toast.makeText(this, "Enter a valid IPv4 address and port (1024–65535).", Toast.LENGTH_LONG).show();
                return;
            }
            nativeSetIp(ip);
            nativeSetPort(port);
            viewerIp.setText(nativeGetViewerIp());
            Toast.makeText(this, "Connection settings applied.", Toast.LENGTH_SHORT).show();
            refreshConnection();
        });
        content.addView(apply);

        Button defaults = actionButton("Reset video settings to defaults");
        defaults.setOnClickListener(v -> {
            nativeResetDefaults();
            dialog.dismiss();
            showSettings();
        });
        content.addView(defaults);
        content.addView(text("NTR Viewer HR · Android port", 12, false));

        dialog.setContentView(scroll);
        dialog.setOnDismissListener(d -> { connectionStatus = null; connectionButton = null; });
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawableResource(android.R.color.transparent);
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT,
                    (int) (getResources().getDisplayMetrics().heightPixels * 0.88f));
            window.setGravity(Gravity.BOTTOM);
            window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        }
    }
}
