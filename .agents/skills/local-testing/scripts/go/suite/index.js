const path = require('path');
const Mocha = require('mocha');

const dist = path.resolve(__dirname, '../../../../../../dist-desktop');
const integration = path.join(dist, 'test/integration');

async function run() {
  require('source-map-support').install(); // eslint-disable-line global-require
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { initializeTestEnvironment } = require(
    path.join(integration, 'test_infrastructure/initialize_test_environment'),
  );
  const mocha = new Mocha({ timeout: 120000, color: true });
  mocha.addFile(path.join(__dirname, 'go_navigation.test.js'));
  await initializeTestEnvironment(integration);
  await new Promise((resolve, reject) => {
    mocha.run(failures => (failures ? reject(new Error(`${failures} failed`)) : resolve()));
  });
}

module.exports = { run };
