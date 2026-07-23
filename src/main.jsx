import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

if (!localStorage.getItem('ego_foods_logo_reset_v3')) {
  localStorage.removeItem('kitchen-os.inventory.v2');
  localStorage.setItem('ego_foods_logo_reset_v3', 'true');
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
