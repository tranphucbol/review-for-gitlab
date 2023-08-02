import Vue from 'vue';
import App from './App.vue';
import vSafeHtmlDirective from './directives/SafeHtmlDirective';

Vue.config.productionTip = false;

const app = Vue.createApp(App);

app.directive('safe-html', vSafeHtmlDirective);

app.mount('#app');
