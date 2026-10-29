import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/base.css';
import './popup.css';
import { Popup } from './Popup';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Popup />
    </StrictMode>,
  );
}
