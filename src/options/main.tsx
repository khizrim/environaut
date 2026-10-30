import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/base.css';
import './options.css';
import { Options } from './Options';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Options />
    </StrictMode>,
  );
}
