const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'ios', 'Stylee', 'PrivacyInfo.xcprivacy');

if (!fs.existsSync(filePath)) {
  console.log('PrivacyInfo.xcprivacy not found, skipping');
  process.exit(0);
}

let plist = fs.readFileSync(filePath, 'utf8');
const marker = '<key>NSPrivacyCollectedDataTypes</key>';
const idx = plist.indexOf(marker);

if (idx === -1) {
  console.log('NSPrivacyCollectedDataTypes key not found');
  process.exit(1);
}

const afterKey = plist.indexOf('<array/>', idx);
if (afterKey === -1) {
  console.log('NSPrivacyCollectedDataTypes already has entries, skipping');
  process.exit(0);
}

const before = plist.substring(0, afterKey);
const after = plist.substring(afterKey + '<array/>'.length);

const dataTypes = `<array>
\t\t\t<dict>
\t\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t\t<string>NSPrivacyCollectedDataTypeEmailAddress</string>
\t\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t\t<true/>
\t\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t\t<false/>
\t\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t\t<array>
\t\t\t\t\t<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
\t\t\t\t</array>
\t\t\t</dict>
\t\t\t<dict>
\t\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t\t<string>NSPrivacyCollectedDataTypePhotosOrVideos</string>
\t\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t\t<true/>
\t\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t\t<false/>
\t\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t\t<array>
\t\t\t\t\t<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
\t\t\t\t</array>
\t\t\t</dict>
\t\t\t<dict>
\t\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t\t<string>NSPrivacyCollectedDataTypeUserContent</string>
\t\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t\t<true/>
\t\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t\t<false/>
\t\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t\t<array>
\t\t\t\t\t<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
\t\t\t\t</array>
\t\t\t</dict>
\t\t\t<dict>
\t\t\t\t<key>NSPrivacyCollectedDataType</key>
\t\t\t\t<string>NSPrivacyCollectedDataTypeLocation</string>
\t\t\t\t<key>NSPrivacyCollectedDataTypeLinked</key>
\t\t\t\t<true/>
\t\t\t\t<key>NSPrivacyCollectedDataTypeTracking</key>
\t\t\t\t<false/>
\t\t\t\t<key>NSPrivacyCollectedDataTypePurposes</key>
\t\t\t\t<array>
\t\t\t\t\t<string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
\t\t\t\t</array>
\t\t\t</dict>
\t\t</array>`;

plist = before + dataTypes + after;
fs.writeFileSync(filePath, plist);
console.log('PrivacyInfo.xcprivacy updated with data collection declarations');
