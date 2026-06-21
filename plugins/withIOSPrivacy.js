const {
  withInfoPlist,
} = require('expo/config-plugins');

function withIOSPrivacy(config) {
  // Remove microphone permission from Info.plist
  config = withInfoPlist(config, (config) => {
    delete config.modResults.NSMicrophoneUsageDescription;
    return config;
  });

  return config;
}

module.exports = withIOSPrivacy;
