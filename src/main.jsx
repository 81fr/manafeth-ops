import React from 'react';
import ReactDOM from 'react-dom/client';
import { OpsProvider } from './engine/store';
import { installGlobalErrorHandlers } from './engine/diagnostics';
import { PageErrorBoundary } from './components/ErrorBoundaryAndHealth';
import App from './App';
import './index.css';
import './App.css';

installGlobalErrorHandlers();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PageErrorBoundary routeKey="root">
      <OpsProvider>
        <App />
      </OpsProvider>
    </PageErrorBoundary>
  </React.StrictMode>
);
