import type { ReactNode } from 'react';
import { BrowserConnectivityStatus } from './browser-connectivity-status';
import './studio.css';
import '@form-engine/studio-design-tokens/tokens.css';
import '@form-engine/studio-design-components/styles.css';
import './studio-ui.css';
import '../components/field-picker/field-picker.css';
import './selection-controls.css';
import '@form-engine/materials-react/styles.css';

export const metadata = { title: 'Assemble Studio' };

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {children}
        <BrowserConnectivityStatus />
      </body>
    </html>
  );
}
