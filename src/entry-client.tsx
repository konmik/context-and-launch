import { render } from '@solidjs/web'
import App from './app.js'

const appMount = document.getElementById('app')
if (!appMount) throw new Error('Application mount #app is missing from the document')
render(() => <App />, appMount)
