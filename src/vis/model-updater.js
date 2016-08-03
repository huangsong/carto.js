var _ = require('underscore');

/**
 * This class exposes a method that knows how to set/update the metadata on internal
 * CartoDB.js models that are linked to a "resource" in the Maps API.
 */
var ModelUpdater = function (deps) {
  if (!deps.visModel) {
    throw new Error('visModel is required');
  }
  if (!deps.layerGroupModel) {
    throw new Error('layerGroupModel is required');
  }
  if (!deps.layersCollection) {
    throw new Error('layersCollection is required');
  }
  if (!deps.dataviewsCollection) {
    throw new Error('dataviewsCollection is required');
  }
  if (!deps.analysisCollection) {
    throw new Error('analysisCollection is required');
  }

  this._visModel = deps.visModel;
  this._layerGroupModel = deps.layerGroupModel;
  this._layersCollection = deps.layersCollection;
  this._dataviewsCollection = deps.dataviewsCollection;
  this._analysisCollection = deps.analysisCollection;
};

ModelUpdater.prototype.updateModels = function (windshaftMap, sourceId, forceFetch) {
  this._updateLayerGroupModel(windshaftMap);
  this._updateLayerModels(windshaftMap);
  this._updateDataviewModels(windshaftMap, sourceId, forceFetch);
  this._updateAnalysisModels(windshaftMap);

  this._visModel.setOk();
};

ModelUpdater.prototype._updateLayerGroupModel = function (windshaftMap) {
  var tileSchema = '{z}/{x}/{y}';
  var tileExtension = '.png';
  var subdomains = [''];
  if (windshaftMap.supportsSubdomains()) {
    subdomains = ['0', '1', '2', '3'];
  }

  var urls = {
    tiles: [],
    grids: windshaftMap.getTiles('mapnik').grids
  };

  var indexOfMapnikLayers = windshaftMap.getIndexesOfMapnikLayers();
  var indexOfVisibleLayers = [];

  this._layerGroupModel.layers.each(function (layerModel, layerIndex) {
    if (layerModel.isVisible()) {
      indexOfVisibleLayers.push(indexOfMapnikLayers[layerIndex]);
    }
  });

  if (indexOfVisibleLayers.length > 0) {
    _.each(subdomains, function (subdomain) {
      var tileURLTempate = windshaftMap.getBaseURL(subdomain) + '/' + indexOfVisibleLayers.join(',') + '/' + tileSchema + tileExtension;
      urls.tiles.push(tileURLTempate);
    });
  }

  this._layerGroupModel.set({
    baseURL: windshaftMap.getBaseURL(),
    urls: urls
  });
};

ModelUpdater.prototype._updateLayerModels = function (windshaftMap) {
  var LAYER_TYPES = [ 'CartoDB', 'torque' ];
  _.each(this._layersCollection.select(function (layerModel) {
    return LAYER_TYPES.indexOf(layerModel.get('type')) >= 0;
  }), function (layerModel, layerIndex) {
    layerModel.set('meta', windshaftMap.getLayerMetadata(layerIndex));
    if (layerModel.get('type') === 'torque') {
      layerModel.set('tileURLTemplates', windshaftMap.getTiles('torque').tiles);
    }
    layerModel.setOk();
  }, this);
};

ModelUpdater.prototype._updateDataviewModels = function (windshaftMap, sourceId, forceFetch) {
  this._dataviewsCollection.each(function (dataviewModel) {
    var dataviewMetadata = windshaftMap.getDataviewMetadata(dataviewModel.get('id'));
    if (dataviewMetadata) {
      dataviewModel.set({
        url: dataviewMetadata.url[this._getProtocol()]
      }, {
        sourceId: sourceId,
        forceFetch: forceFetch
      });
    }
  }, this);
};

ModelUpdater.prototype._updateAnalysisModels = function (windshaftMap) {
  this._analysisCollection.each(function (analysisNode) {
    var analysisMetadata = windshaftMap.getAnalysisNodeMetadata(analysisNode.get('id'));
    if (analysisMetadata) {
      var attrs = {
        status: analysisMetadata.status,
        url: analysisMetadata.url[this._getProtocol()],
        query: analysisMetadata.query
      };
      attrs = _.omit(attrs, analysisNode.getParamNames());
      analysisNode.set(attrs);
      analysisNode.setOk();
    }
  }, this);
};

ModelUpdater.prototype._getProtocol = function () {
  // When running tests window.locationn.protocol using the jasmine test runner,
  // window.location.protocol returns 'file:'. This is a little hack to make tests happy.
  if (window.location.protocol === 'file:') {
    return 'http';
  }
  return window.location.protocol.replace(':', '');
};

ModelUpdater.prototype.setErrors = function (errors) {
  _.each(errors, this._setError, this);
};

ModelUpdater.prototype._setError = function (error) {
  if (error.isLayerError()) {
    var layerModel = this._layersCollection.get(error.layerId);
    layerModel && layerModel.setError(error);
  } else if (error.isAnalysisError()) {
    var analysisModel = this._analysisCollection.get(error.analysisId);
    analysisModel && analysisModel.setError(error);
  } else {
    this._visModel.setError(error);
  }
};

module.exports = ModelUpdater;
