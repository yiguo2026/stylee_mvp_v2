import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="zh">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: webShellStyle }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const webShellStyle = `
@media (min-width: 430px) {
  body {
    background-color: #FFFFFF;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  #root {
    width: 393px;
    height: 852px;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05);
  }
}
`;
