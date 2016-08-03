var $ = require('jquery');
var Backbone = require('backbone');
var Map = require('../../../../src/geo/map');
var GoogleMapsMapView = require('../../../../src/geo/gmaps/gmaps-map-view');
var GMapsLayerViewFactory = require('../../../../src/geo/gmaps/gmaps-layer-view-factory');
var TorqueLayer = require('../../../../src/geo/map/torque-layer');
var SharedTestsForTorqueLayer = require('../shared-tests-for-torque-layer');
var torque = require('torque.js');

describe('geo/gmaps/gmaps-torque-layer-view', function () {
  beforeEach(function () {
    var container = $('<div>').css('height', '200px');
    this.vis = jasmine.createSpyObj('vis', ['reload']);
    var map = new Map();
    var mapView = new GoogleMapsMapView({
      el: container,
      map: map,
      layerViewFactory: new GMapsLayerViewFactory(),
      layerGroupModel: new Backbone.Model()
    });

    this.model = new TorqueLayer({
      type: 'torque',
      sql: 'select * from table',
      cartocss: '#test {}',
      'torque-steps': 100
    }, { vis: this.vis });
    spyOn(torque, 'GMapsTorqueLayer').and.callThrough();
    map.addLayer(this.model);
    this.view = mapView._layerViews[this.model.cid];
  });

  SharedTestsForTorqueLayer.call(this);

  it('should apply TorqueLayer initialize method on the extended view with a bunch of attrs', function () {
    expect(torque.GMapsTorqueLayer).toHaveBeenCalled();

    var attrs = torque.GMapsTorqueLayer.calls.argsFor(0)[0];
    expect(attrs.cartocss).toEqual(jasmine.any(String));
  });
});
