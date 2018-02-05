var Backbone = require('backbone');

var UISettings = Backbone.Model.extend({
  defaults: {
    showLegends: true,
    showLayerSelector: false,
    isEmbed: false
  }
});

module.exports = UISettings;
