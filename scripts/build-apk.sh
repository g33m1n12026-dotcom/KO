#!/usr/bin/env bash
set -e

echo "=== Budowanie KOReader Companion APK ==="

BUILD_DIR="./tmp/android_apk_build"
mkdir -p "$BUILD_DIR/src/com/koreader/aicloud" \
  "$BUILD_DIR/res/values" \
  "$BUILD_DIR/res/mipmap-hdpi" \
  "$BUILD_DIR/bin" \
  "$BUILD_DIR/obj" \
  ./public/download

# 1. Generate R.java
aapt package -f -m -J "$BUILD_DIR/src/" \
  -M "$BUILD_DIR/AndroidManifest.xml" \
  -S "$BUILD_DIR/res/" \
  -I /opt/android-sdk/android.jar

# 2. Compile Java classes
javac -cp /opt/android-sdk/android.jar \
  -source 8 -target 8 \
  -d "$BUILD_DIR/obj/" \
  "$BUILD_DIR/src/com/koreader/aicloud/"*.java

# 3. Compile to classes.dex with D8
java -cp /opt/android-sdk/r8.jar com.android.tools.r8.D8 \
  --lib /opt/android-sdk/android.jar \
  --output "$BUILD_DIR/bin/" \
  "$BUILD_DIR/obj/com/koreader/aicloud/"*.class

# 4. Package APK resources
aapt package -f \
  -M "$BUILD_DIR/AndroidManifest.xml" \
  -S "$BUILD_DIR/res/" \
  -I /opt/android-sdk/android.jar \
  -F "$BUILD_DIR/bin/unsigned.apk"

# 5. Add classes.dex
cd "$BUILD_DIR/bin"
aapt add unsigned.apk classes.dex
cd - > /dev/null

# 6. Zipalign
zipalign -f -p 4 \
  "$BUILD_DIR/bin/unsigned.apk" \
  "$BUILD_DIR/bin/aligned.apk"

# 7. Sign APK
apksigner sign \
  --ks "$BUILD_DIR/debug.keystore" \
  --ks-pass pass:android \
  --key-pass pass:android \
  --out ./public/download/KOReader-Companion.apk \
  "$BUILD_DIR/bin/aligned.apk"

cp ./public/download/KOReader-Companion.apk ./public/KOReader-Companion.apk

echo "APK gotowe: ./public/download/KOReader-Companion.apk"
apksigner verify -v ./public/download/KOReader-Companion.apk
