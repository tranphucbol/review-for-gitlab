import Vue from 'vue';
import App from './App.vue';
import '@shared/styles/tokens.scss';
import '@shared/styles/markdown.scss';
import './styles.scss';

Vue.config.productionTip = false;

new Vue({
  render: h => h(App),
}).$mount('#app');
