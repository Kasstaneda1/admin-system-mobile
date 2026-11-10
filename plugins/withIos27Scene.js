// iOS 27 SDK (Xcode 27): an app must use the UIScene life cycle, or it stops right at
// launch. Expo SDK 54's template still makes the window and starts React Native in the
// AppDelegate, so on every prebuild (local or EAS) this plugin changes three generated files:
//  - AppDelegate.swift: no window there; a SceneDelegate makes it and starts React Native;
//  - Info.plist: the scene manifest that names that SceneDelegate;
//  - Podfile: pods that ask for less than iOS 15.1 get 15.1 (Xcode 27 refuses them).
// These are the changes the owner's iPhone build has used since 2026-11-04. Take the plugin
// out with the Expo SDK upgrade that brings the scene life cycle itself (APP-4).
//
// Not with expo-dev-client: its SDK 54 launcher looks for the window at launch, before any
// scene exists. The development profile is a Debug build that loads the JS from Metro.
const { withAppDelegate, withInfoPlist, withPodfile } = require('expo/config-plugins');

const SCENE_DELEGATE = 'SceneDelegate';

// The SDK 54 template's window and start of React Native, inside didFinishLaunching
const TEMPLATE_START = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n/;

const SCENE_DELEGATE_SWIFT = `
// iOS 27 SDK: apps must adopt the UIScene life cycle, so React Native starts here.
class ${SCENE_DELEGATE}: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }
    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: nil)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    for context in URLContexts {
      RCTLinkingManager.application(UIApplication.shared, open: context.url, options: [:])
    }
  }
}
`;

function withSceneDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    const file = cfg.modResults;
    if (file.language !== 'swift') {
      throw new Error('withIos27Scene: expected a Swift AppDelegate (Expo SDK 54)');
    }
    if (file.contents.includes(`class ${SCENE_DELEGATE}:`)) return cfg;
    if (!TEMPLATE_START.test(file.contents)) {
      // A new template: better no build than an app that stops at launch
      throw new Error('withIos27Scene: AppDelegate.swift is not the Expo SDK 54 template; check whether the plugin is still needed');
    }
    file.contents = file.contents.replace(TEMPLATE_START,
      '\n    // The window is created by SceneDelegate: the iOS 27 SDK requires the scene life cycle.\n');
    file.contents = `${file.contents.replace(/\s*$/, '\n')}${SCENE_DELEGATE_SWIFT}`;
    return cfg;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [{
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: `$(PRODUCT_MODULE_NAME).${SCENE_DELEGATE}`,
        }],
      },
    };
    return cfg;
  });
}

const MIN_TARGET_MARK = '# semix-min-target';
const MIN_TARGET = `    ${MIN_TARGET_MARK}: Xcode 27 rejects pods below iOS 15
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = "15.1" if c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"].to_f < 15.1
      end
    end
`;

function withPodsMinTarget(config) {
  return withPodfile(config, (cfg) => {
    const file = cfg.modResults;
    if (file.contents.includes(MIN_TARGET_MARK)) return cfg;
    const hook = /^(\s*post_install do \|installer\|\n)/m;
    if (!hook.test(file.contents)) {
      throw new Error('withIos27Scene: no post_install in the Podfile');
    }
    file.contents = file.contents.replace(hook, `$1${MIN_TARGET}`);
    return cfg;
  });
}

module.exports = function withIos27Scene(config) {
  return withPodsMinTarget(withSceneManifest(withSceneDelegate(config)));
};
