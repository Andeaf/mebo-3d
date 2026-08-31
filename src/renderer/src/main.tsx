import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './assets/app.css'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('missing #root element')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
