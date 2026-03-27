ANDROID_DIR := android
APK_DEBUG_SRC := $(ANDROID_DIR)/app/build/outputs/apk/debug/app-debug.apk
APK_RELEASE_SRC := $(ANDROID_DIR)/app/build/outputs/apk/release/app-release.apk
APK_DEBUG_DST := app-debug.apk
APK_RELEASE_DST := app-release.apk
GRADLE := cd $(ANDROID_DIR) && ./gradlew

.PHONY: debug release rundebug pushvercel

debug:
	npm run build
	npx cap sync android
	$(GRADLE) assembleDebug
	cp $(APK_DEBUG_SRC) $(APK_DEBUG_DST)
	@echo "Debug APK copied to $(APK_DEBUG_DST)"

release:
	npm run build
	npx cap sync android
	$(GRADLE) assembleRelease -x lintVitalAnalyzeRelease
	cp $(APK_RELEASE_SRC) $(APK_RELEASE_DST)
	@echo "Release APK copied to $(APK_RELEASE_DST)"

rundebug:
	npx concurrently -k "npm run api:dev" "npm run dev"

pushvercel:
	npx vercel --prod
