import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { pickAddress } from '@/lib/newOrder/pick';
import { BigButton, Body, Field, Screen } from '@/ui/kit';

// 카카오(다음) 우편번호 서비스: 키 없이 무료로 쓰는 주소 검색 화면. 고르면 앱으로 주소를 보낸다.
const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<script src="https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script></head>
<body style="margin:0"><div id="w" style="width:100%;height:100vh"></div>
<script>
new daum.Postcode({
  width: '100%', height: '100%',
  oncomplete: function (d) {
    window.ReactNativeWebView.postMessage(d.roadAddress || d.jibunAddress || d.address);
  }
}).embed(document.getElementById('w'));
</script></body></html>`;

function done(address: string) {
  if (!address.trim()) return;
  pickAddress(address.trim());
  router.back();
}

/** 주소를 직접 적는 칸 (웹 확인용, 휴대폰에서는 검색이 안 될 때 대신 쓰기) */
function TypeIn({ note }: { note: string }) {
  const [typed, setTyped] = useState('');
  return (
    <>
      <Body sub>{note}</Body>
      <Field label="주소" value={typed} onChangeText={setTyped} placeholder="예: 서울 강남구 테헤란로 152" onSubmitEditing={() => done(typed)} />
      <BigButton label="이 주소로" onPress={() => done(typed)} disabled={!typed.trim()} />
    </>
  );
}

/** 주소 검색 (휴대폰: 우편번호 검색 화면 / 웹 개발 확인용: 주소를 직접 입력) */
export default function AddressSearch() {
  const [manual, setManual] = useState(false);
  if (Platform.OS === 'web') {
    return <Screen><TypeIn note="웹 확인용: 도로명이나 지번 주소를 그대로 입력해 주세요." /></Screen>;
  }
  if (manual) {
    return <Screen><TypeIn note="도로명이나 지번 주소를 그대로 입력해 주세요." /></Screen>;
  }
  return (
    <View style={{ flex: 1 }}>
      {/* baseUrl이 없으면 검색 결과를 눌러도 선택 신호가 앱까지 오지 않는다 (about:blank 출처) */}
      <WebView
        originWhitelist={['*']}
        source={{ html: HTML, baseUrl: 'https://postcode.map.daum.net' }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="compatibility"
        onMessage={e => done(e.nativeEvent.data)}
      />
      <View style={{ padding: 12 }}>
        <BigButton label="검색이 안 되면: 주소 직접 입력" tone="plain" onPress={() => setManual(true)} />
      </View>
    </View>
  );
}
