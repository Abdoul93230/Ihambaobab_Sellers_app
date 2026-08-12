const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// react-native-gesture-handler crashe sur les émulateurs Android x86 avec la New Architecture.
// On le remplace par un stub sans code natif. Les swipe-back sont désactivés par défaut sur
// Android donc rien de fonctionnel n'est perdu.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-native-gesture-handler') {
    return {
      filePath: path.resolve(__dirname, 'src/mocks/gesture-handler-stub.js'),
      type: 'sourceFile',
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
