import Vue from 'vue';
import VTooltip from 'v-tooltip';
import App from './App.vue';
import '@shared/styles/tokens.scss';
import '@shared/styles/markdown.scss';
import './styles/mermaid.scss';

Vue.config.productionTip = false;
Vue.use(VTooltip);

new Vue({
  render: h => h(App),
}).$mount('#app');
