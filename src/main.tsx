import { discoverModules } from './core/discover';
import { startApp } from './ui/start';

const root = document.getElementById('app');
if (!root) throw new Error('#app fehlt in index.html');
startApp(root, discoverModules()).catch((error) => {
  console.error('Das Spiel konnte nicht starten.', error);
});
