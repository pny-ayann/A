// app.json에 더해, 빌드할 때만 필요한 값을 넣는다.
// google-services.json(푸시용 Firebase 설정)은 GitHub에 올리지 않고 EAS 파일 환경변수 GOOGLE_SERVICES_JSON으로 받는다.
const fs = require('fs');

module.exports = ({ config }) => {
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
    ?? (fs.existsSync('./google-services.json') ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
