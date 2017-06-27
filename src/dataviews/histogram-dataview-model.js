var _ = require('underscore');
var Backbone = require('backbone');
var DataviewModelBase = require('./dataview-model-base');
var HistogramDataModel = require('./histogram-dataview/histogram-data-model');
var d3 = require('d3');

module.exports = DataviewModelBase.extend({

  defaults: _.extend(
    {
      type: 'histogram',
      totalAmount: 0,
      filteredAmount: 0
    },
    DataviewModelBase.prototype.defaults
  ),

  _getDataviewSpecificURLParams: function () {
    var params = [];

    if (_.isNumber(this.get('own_filter'))) {
      params.push('own_filter=' + this.get('own_filter'));
    } else {
      if (_.isNumber(this.get('start'))) {
        params.push('start=' + this.get('start'));
      }
      if (_.isNumber(this.get('end'))) {
        params.push('end=' + this.get('end'));
      }
      if (this.get('aggregation')) {
        params.push('aggregation=' + this.get('aggregation'));
      } else if (this.get('bins')) {
        params.push('bins=' + this.get('bins'));
      }
    }
    return params;
  },

  initialize: function (attrs, opts) {
    // Internal model for calculating all the data in the histogram (without filters)
    this._originalData = new HistogramDataModel({
      bins: this.get('bins'),
      aggregation: this.get('aggregation'),
      apiKey: this.get('apiKey'),
      authToken: this.get('authToken')
    });

    DataviewModelBase.prototype.initialize.apply(this, arguments);
    this._data = new Backbone.Collection(this.get('data'));

    if (attrs && (attrs.min || attrs.max)) {
      this.filter.setRange(this.get('min'), this.get('max'));
    }
  },

  _initBinds: function () {
    DataviewModelBase.prototype._initBinds.apply(this);

    this._updateURLBinding();

    // When original data gets fetched
    this._originalData.bind('change:data', this._onDataChanged, this);
    this._originalData.once('change:data', this._updateBindings, this);

    this.on('change:column', this._reloadVisAndForceFetch, this);
    this.on('change', this._onFieldsChanged, this);

    this.listenTo(this.layer, 'change:meta', this._onChangeLayerMeta);
  },

  _updateURLBinding: function () {
    // We shouldn't listen url change for fetching the data (with filter) because
    // we have to wait until we know all the data available (without any filter).
    this.off('change:url');
    this.on('change:url', this._onUrlChanged, this);
  },

  _updateBindings: function () {
    this._onChangeBinds();
    this._updateURLBinding();
  },

  enableFilter: function () {
    this.set('own_filter', 1);
  },

  disableFilter: function () {
    this.unset('own_filter');
  },

  getData: function () {
    return this._data.toJSON();
  },

  getUnfilteredDataModel: function () {
    return this._originalData;
  },

  getSize: function () {
    return this._data.size();
  },

  parse: function (data) {
    var numberOfBins = data.bins_count;
    var isAggregation = !!this.get('aggregation');
    var width = data.bin_width;
    var start = data.bins_start;

    // Temporary hack
    // if (this._originalData.get('bins') && this._originalData.get('bins') < numberOfBins) {
    //   numberOfBins = this._originalData.get('bins');
    // }

    var buckets = new Array(numberOfBins);

    _.each(data.bins, function (b) {
      buckets[b.bin] = b;
    });

    isAggregation ? this._originalData.fillTimestampBuckets(buckets, start, this.get('aggregation'), numberOfBins) : this._originalData.fillNumericBuckets(buckets, start, width, numberOfBins);

    // FIXME - Update the end of last bin due https://github.com/CartoDB/cartodb.js/issues/926
    var lastBucket = buckets[numberOfBins - 1];
    if (lastBucket && lastBucket.end < lastBucket.max) {
      lastBucket.end = lastBucket.max;
    }

    this._data.reset(buckets);

    // Calculate totals
    var totalAmount = this._calculateTotalAmount(buckets);
    var filteredAmount = this._calculateFilteredAmount(this.filter, this._data);

    return {
      data: buckets,
      nulls: data.nulls,
      totalAmount: totalAmount,
      filteredAmount: filteredAmount
    };
  },

  _onFilterChanged: function (filter) {
    this.set('filteredAmount', this._calculateFilteredAmount(filter, this._data));

    DataviewModelBase.prototype._onFilterChanged.apply(this, arguments);
  },

  _calculateTotalAmount: function (buckets) {
    return _.reduce(buckets, function (memo, bucket) {
      return memo + bucket.freq;
    }, 0);
  },

  _calculateFilteredAmount: function (filter, data) {
    var filteredAmount = 0;
    if (filter && filter.get('min') !== void 0 && filter.get('max') !== void 0) {
      var indexes = this._findBinsIndexes(data, filter.get('min'), filter.get('max'));
      filteredAmount = this._sumBinsFreq(data, indexes.start, indexes.end);
    }

    return filteredAmount;
  },

  _findBinsIndexes: function (data, start, end) {
    var startBin = data.findWhere({ start: Math.min(start, end) });
    var endBin = data.findWhere({ end: Math.max(start, end) });

    return {
      start: startBin && startBin.get('bin'),
      end: endBin && endBin.get('bin')
    };
  },

  _sumBinsFreq: function (data, start, end) {
    return _.reduce(data.slice(start, end + 1), function (acum, d) {
      return (d.get('freq') || 0) + acum;
    }, 0);
  },

  /*
  Ported from cartodb-postgresql
  https://github.com/CartoDB/cartodb-postgresql/blob/master/scripts-available/CDB_DistType.sql
  */
  getDistributionType: function (data) {
    var histogram = data || this.get('data');
    var freqAccessor = function (a) { return a.freq; };
    var osc = d3.max(histogram, freqAccessor) - d3.min(histogram, freqAccessor);
    var mean = d3.mean(histogram, freqAccessor);
    // When the difference between the max and the min values is less than
    // 10 percent of the mean, it's a flat histogram (F)
    if (osc < mean * 0.1) return 'F';
    var sumFreqs = d3.sum(histogram, freqAccessor);
    var freqs = histogram.map(function (bin) {
      return 100 * bin.freq / sumFreqs;
    });

    // The ajus array represents relative growths
    var ajus = freqs.map(function (freq, index) {
      var next = freqs[index + 1];
      if (freq > next) return -1;
      if (Math.abs(freq - next) <= 0.05) return 0;
      return 1;
    });
    ajus.pop();
    var maxAjus = d3.max(ajus);
    var minAjus = d3.min(ajus);
    // If it never grows or shrinks, it returns flat
    if (minAjus === 0 && maxAjus === 0) return 'F';
    else if (maxAjus < 1) return 'L';
    else if (minAjus > -1) return 'J';
    else {
      var uniques = _.uniq(ajus);
      var A_TYPES = [[1, -1], [1, 0, -1], [1, -1, 0], [0, 1, -1]];
      var U_TYPES = [[-1, 1], [-1, 0, 1], [-1, 1, 0], [0, -1, 1]];
      if (A_TYPES.some(function (e) {
        return _.isEqual(e, uniques);
      })) return 'A';
      else if (U_TYPES.some(function (e) {
        return _.isEqual(e, uniques);
      })) return 'U';
      else return 'S';
    }
  },

  toJSON: function (d) {
    var options = {
      column: this.get('column'),
      aggregation: this.get('aggregation'),
      bins: this.get('bins')
    };

    return {
      type: 'histogram',
      source: { id: this.getSourceId() },
      options: options
    };
  },

  _onChangeLayerMeta: function () {
    this.filter.set('column_type', this.layer.get('meta').column_type);
  },

  _onChangeBinds: function () {
    DataviewModelBase.prototype._onChangeBinds.call(this);
  },

  _onUrlChanged: function () {
    this._originalData.set({
      aggregation: this.get('aggregation'),
      bins: this.get('bins')
    }, { silent: true });

    this._originalData.setUrl(this.get('url'));
  },

  _onDataChanged: function (model) {
    this.set({
      start: model.get('start'),
      end: model.get('end'),
      bins: model.get('bins')
    }, { silent: true });

    this._resetFilterAndFetch();
  },

  _onFieldsChanged: function () {
    if (!this._hasChangedSomeOf(['bins', 'aggregation'], this.changed)) {
      return;
    }

    if (this._onlyBinsHasChanged(this.changed)) {
      this._originalData.set('bins', this.get('bins'))
    } else if (this._onlyAggregationHasChanged(this.changed)) {
      this._originalData.set('aggregation', this.get('aggregation'))
    }
  },

  _resetFilterAndFetch: function () {
    this.disableFilter();
    this.filter.unsetRange();
    this.fetch();
  },

  // Helper functions - - - -

  _onlyBinsHasChanged: function (changed) {
    return this._hasKeyWithValue(changed, 'bins') && !_.has(changed, 'aggregation');
  },

  _onlyAggregationHasChanged: function (changed) {
    return this._hasKeyWithValue(changed, 'aggregation') && !_.has(changed, 'bins');
  },

  _hasUndefinedKey: function (obj, key) {
    return _.has(obj, key) && obj[key] === void 0;
  },

  _hasKeyWithValue: function (obj, key) {
    return _.has(obj, key) && obj[key] !== void 0;
  },

  _hasChangedSomeOf: function (list, changed) {
    return _.some(_.keys(changed), function (key) {
      return _.contains(list, key);
    });
  }
},

  // Class props
  {
    ATTRS_NAMES: DataviewModelBase.ATTRS_NAMES.concat([
      'column',
      'bins',
      'min',
      'max',
      'aggregation'
    ])
  }
);
