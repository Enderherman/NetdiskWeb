import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles.css'
import './files.css'
import './uploads.css'

createApp(App).use(router).mount('#app')
