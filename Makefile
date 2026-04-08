ANDROID_DIR := android
APK_DEBUG_SRC := $(ANDROID_DIR)/app/build/outputs/apk/debug/app-debug.apk
APK_RELEASE_SRC := $(ANDROID_DIR)/app/build/outputs/apk/release/app-release.apk
APK_DEBUG_DST := app-debug.apk
APK_RELEASE_DST := app-release.apk

ifeq ($(OS),Windows_NT)
POWERSHELL := powershell.exe -NoProfile -ExecutionPolicy Bypass -File
NODE := $(POWERSHELL) scripts/run-node-tool.ps1 node
NPM := $(POWERSHELL) scripts/run-node-tool.ps1 npm
NPX := $(POWERSHELL) scripts/run-node-tool.ps1 npx
COPY_FILE = powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Copy-Item -LiteralPath '$(1)' -Destination '$(2)' -Force"
else
NODE := node
NPM := npm
NPX := npx
COPY_FILE = cp $(1) $(2)
endif

GRADLE := $(NODE) scripts/run-gradle.mjs

.PHONY: debug release rundebug pushvercel ensure-android-sdk

ensure-android-sdk:
	$(NODE) scripts/ensure-android-sdk.mjs

debug:
	$(NPM) run build
	$(NPX) cap sync android
	$(MAKE) ensure-android-sdk
	$(GRADLE) assembleDebug
	$(call COPY_FILE,$(APK_DEBUG_SRC),$(APK_DEBUG_DST))
	@echo "Debug APK copied to $(APK_DEBUG_DST)"

release:
	$(NPM) run build
	$(NPX) cap sync android
	$(MAKE) ensure-android-sdk
	$(GRADLE) assembleRelease -x lintVitalAnalyzeRelease
	$(call COPY_FILE,$(APK_RELEASE_SRC),$(APK_RELEASE_DST))
	@echo "Release APK copied to $(APK_RELEASE_DST)"

rundebug:
	npx concurrently -k "npm run api:dev" "npm run dev"

pushvercel:
	npx vercel --prod
