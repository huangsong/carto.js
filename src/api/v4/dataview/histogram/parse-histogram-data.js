var _ = require('underscore');

/**
 * Transform the data obtained from an internal histogram dataview into a 
 * public object.
 * 
 * @param {object[]} data - The raw histogram data
 * @param {number} nulls - Number of data with a null
 * @param {number} totalAmount - Total number of data in the histogram.
 * 
 * @return {HistogramData} - The parsed and formatted data for the given parameters.
 */
function parseHistogramData (data, nulls, totalAmount) {
  if (!data) {
    return null;
  }
  var maxFreq = _.max(data, function (bin) { return bin.freq || 0; }).freq;

  /**
   * @description
   * #Object containing histogram data.
   * 
   * @typedef {object} HistogramData
   * @property {number} nulls - The number of items with null value.
   * @property {number} totalAmount - The number of elements returned.
   * @property {BinItem[]} result - Array containing the {@link BinItem|data bins} for the histogram. .
   * @property {string} type - String with value: **histogram**
   * @api
   */
  return {
    result: _createResult(data, maxFreq),
    nulls: nulls || 0,
    totalAmount: totalAmount
  };
}

/**
 * Transform the histogram raw data into {@link BinItem}
 */
function _createResult (data, maxFreq) {
  return data.map(function (bin) {
    /** 
      * @typedef {object} BinItem
      * @property {number} index - Number indicating the bin order.
      * @property {number} min - Only appears if freq > 0
      * @property {number} max - Only appears if freq > 0
      * @property {number} avg - Only appears if freq > 0
      * @property {number} freq - The number of the times the element appears in the data.
      * @property {number} normalized - 
      * @api
      */
    return _.extend(bin, { normalized: _.isFinite(bin.freq) ? bin.freq / maxFreq : 0 });
  });
}

module.exports = parseHistogramData;
