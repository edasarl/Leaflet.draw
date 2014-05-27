L.View = L.Class.extend({
	includes: L.Mixin.Events,
	statics: {
		defaultOptions: {
			color: '#555',
			weight: 2,
			opacity: 0.5,
			dashArray: '5, 5',
			fill: false,
			fillColor: null, //same as color by default
			fillOpacity: 0.2,
			clickable: false
		}
	},
	initialize: function (map, shape, drawOptions, shapeOptions) {
		this._map = map;
		this.zoom = shape.zoom || this._map.getZoom();
		this.startll = shape.startll;
		this.endll = shape.endll;

		var latlng = shape.round ? this._map._roundLatlng(this.startll, this.endll, 10, 40, this.zoom)[0] : this.endll;
		this.rectangle = new L.Rectangle(new L.LatLngBounds(this.startll, latlng), drawOptions);
		this.editing = this.rectangle.editing;
		this.rectangle._zoom = this.zoom;
		this.rectangle.view = this;
		this._interface = shapeOptions && shapeOptions.interface || 'leaflet';
		this._minzoom = Math.max(shapeOptions && shapeOptions.minzoom || (this.zoom - 2), this._map.getMinZoom());
		this._maxzoom = Math.min(shapeOptions && shapeOptions.maxzoom || (this.zoom + 2), this._map.getMaxZoom());

		this.setCoordsMarker();
	},
	setCoordsMarker: function () {
		var bounds = this.rectangle.getBounds(),
			northEast = this._map.project(bounds._northEast, this.zoom),
			southWest = this._map.project(bounds._southWest, this.zoom),
			width =  Math.round(northEast.x - southWest.x),
			height = Math.round(southWest.y - northEast.y),
			fullScreen = (width === 40 && height === 40);
		var htmlContent = fullScreen ? 'Plein écran': width + 'x' + height;

		var myIcon = L.divIcon({
			html: '<span class="leaflet-draw-tooltip-single">' + htmlContent + ' z=' +
			this.rectangle._zoom + '</span>',
			iconAnchor: [110, -10],
			className: 'coords-icon'
		});

		var iconLatLng = [bounds._southWest.lat, bounds._northEast.lng];

		if (!this._coordsMarker) {
			this._coordsMarker = new L.ViewMarker(iconLatLng, {icon: myIcon});
			this._coordsMarker.setZIndexOffset(100002);
			this._coordsMarker._rectangle = this.rectangle;
			this._coordsMarker.view = this;
		} else {
			this._coordsMarker.setIcon(myIcon);
			this._coordsMarker.setLatLng(iconLatLng);
		}
		this._width = width;
		this._height = height;
		this._fullscreen = fullScreen;
	},
	finalize: function () {
		this._coordsMarker.setIcon(L.ViewMarker.prefIcon);
	},
	setBounds: function (endll) {
		if (endll instanceof L.LatLngBounds) {
			this.rectangle.setBounds(endll);
		} else {
			var latlng = this._map._roundLatlng(this.startll, endll, 10, 40, this.zoom)[0];
			this.rectangle.setBounds(new L.LatLngBounds(this.startll, latlng));
		}

		this.setCoordsMarker();
		return this;
	},
	getBounds: function () {
		return this.rectangle.getBounds();
	},

	setLatLng: function (latLng) {
		this._coordsMarker.setLatLng(latLng);
		return this;
	},
	getLatLng: function () {
		return this._coordsMarker.getLatLng();
	},
	getRectangle: function () {
		return this.rectangle;
	},
	getMarker: function () {
		return this._coordsMarker;
	},
	getProperties: function (saving) {
		var obj = {
			width: this._width,
			height: this._height,
			zoom: this.rectangle._zoom,
			interface: this._interface,
			minzoom: this._minzoom,
			maxzoom: this._maxzoom,
			fullscreen: this._fullscreen
		};
		if (!saving) {
			obj.edited = this.rectangle.edited;
		}
		return obj;
	},
	setProperties: function (obj) {
		if (obj.bounds) {this.setBounds(obj.bounds); }
		if (obj.interface) {this._interface = obj.interface; }
		if (obj.minzoom) {this._minzoom = obj.minzoom; }
		if (obj.maxzoom) {this._maxzoom = obj.maxzoom; }
		if (obj.hasOwnProperty('edited')) {this.rectangle.edited = obj.edited; }
		return this;
	},
	onAdd: function (map) {
		map.addLayer(this.rectangle);
		map.addLayer(this._coordsMarker);
		var self = this;
		this._coordsMarker.on('click', function () {
			self.fire('click');
		});
	},
	onRemove: function (map) {
		map.removeLayer(this.rectangle);
		map.removeLayer(this._coordsMarker);
		this._coordsMarker.off('click');
	},
	setStyle: function (obj) {
		this.rectangle.setStyle(obj);
		return this;
	},
	addClass: function (className) {
		L.DomUtil.addClass(this._coordsMarker._icon, className);
		L.DomUtil.addClass(this.editing._moveMarker._icon, className);
		return this;
	},
	removeClass: function (className) {
		L.DomUtil.removeClass(this._coordsMarker._icon, className);
		L.DomUtil.removeClass(this.editing._moveMarker._icon, className);
		return this;
	},
	toGeoJSON: function () {
		return this.rectangle.toGeoJSON();
	}

});



L.ViewMarker = L.Marker.extend({
	statics: {
		prefIcon: L.divIcon({
			className: 'view-button view-preference'
		})
	}
});

L.Draw.Rectangle = L.Draw.SimpleShape.extend({
	statics: {
		TYPE: 'rectangle'
	},

	options: {
		shapeOptions: {
			stroke: true,
			color: '#f06eaa',
			weight: 4,
			opacity: 0.5,
			fill: true,
			fillColor: null, //same as color by default
			fillOpacity: 0.2,
			clickable: true
		}
	},

	initialize: function (map, options, viewLayer) {
		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.Rectangle.TYPE;

		this._initialLabelText = L.drawLocal.draw.handlers.rectangle.tooltip.start;
		this.viewLayer = viewLayer;
		this._deletedLayers = L.layerGroup();
		this.newViews = L.layerGroup();
		this.panel = options.panel;

		L.Draw.SimpleShape.prototype.initialize.call(this, map, options);
		var self = this;
		map.on('viewFocus', function (e) {
			if (self._isDrawing) { return; }
			self.enable();
			self._onClick(e);
		});
	},
	addHooks: function () {
		L.Draw.SimpleShape.prototype.addHooks.call(this);
		if (this._map) {
			this.backup();
			this.viewLayer.on('layeradd', this._backupLayer, this);
			this._map.on('click editstart', this._blur, this);
			this._map.on('delete', this._remove, this);
		}
	},
	backup: function () {
		this.viewLayer.eachLayer(this._backupLayer, this);
	},
	removeHooks: function () {
		L.Draw.SimpleShape.prototype.removeHooks.call(this);
		if (this._map) {
			this._map.off('delete', this._remove, this);
			this._map.off('click editstart', this._blur, this);
			if (this.focused) {
				this.focused.removeClass('active');
				this.focused.setStyle(L.View.defaultOptions);
				this.panel.blurView();
				this.focused = null;
			}
			this.viewLayer.off('layeradd', this._backupLayer, this);
			this.save(true);
		}
	},
	_blur: function () {
		if (!this.focused) {
			return;
		}
		this._container.style.cursor = 'crosshair';
		this.focused.removeClass('active');
		this.focused.setStyle(L.View.defaultOptions);
		this.panel.blurView();
		this.focused = null;
		var self = this;
		setTimeout(function () {
			self._map.on('click', self._onMouseDown, self);
		}, 0);
	},
	_onClick: function (e) {
		var layer = e.layer;
		if (this.focused === layer) {
			return;
		} else {
			this._container.style.cursor = '';
			if (this.focused) {
				this.focused.removeClass('active');
				this.focused.setStyle(L.View.defaultOptions);
				this.panel.blurView();
			}
			this.focused = layer;
			layer.setStyle({opacity: 1, color: '#000000'});
			layer.addClass('active');
			this.panel.focusView(layer);
			this._map.off('click', this._onMouseDown, this);
		}
	},
	_remove: function () {
		var layer = this.focused;
		this._blur();
		this.viewLayer.removeLayer(layer);
		this._deletedLayers.addLayer(layer);
	},
	deleteLastVertex: function () {
		if (this._isDrawing) {
			if (this._map  && this._shape) {
				this._map.removeLayer(this._shape);
				delete this._shape;
			}
			this.panel.updateToolTip(this._initialLabelText);
			this._isDrawing = false;
		}
	},
	cancel: function () {
		var self = this;
		if (this.focused && (this.focused.getProperties().edited ||
				this.newViews.hasLayer(this.focused))) {
			this._blur();
		}
		this._deletedLayers.eachLayer(function (layer) {
			self.viewLayer.addLayer(layer);
		});
		this._deletedLayers.clearLayers();
		this.newViews.eachLayer(function (layer) {
			self.viewLayer.removeLayer(layer);
		});
		this.newViews.clearLayers();
		this.viewLayer.eachLayer(function (layer) {
			self._revertLayer(layer);
			layer.editing.updateMarkers();
		});
	},
	save: function (exiting) {
		var self = this;
		this._deletedLayers.eachLayer(function (view) {
			if (self.newViews.hasLayer(view)) {
				self.newViews.removeLayer(view);
				self._deletedLayers.removeLayer(view);
			}
		});

		this.newViews.eachLayer(function (view) {
			L.Draw.SimpleShape.prototype._fireCreatedEvent.call(self, view);
			view.setProperties({edited: false});
		});
		this.newViews.clearLayers();
		this._map.fire('draw:deleted', {layers: this._deletedLayers});
		this._deletedLayers.clearLayers();
		var editedLayers = new L.LayerGroup();
		this.viewLayer.eachLayer(function (view) {
			if (view.getProperties().edited) {
				editedLayers.addLayer(view);
				view.setProperties({edited: false});
			}
		});
		this._map.fire('draw:edited', {layers: editedLayers});
		if (exiting !== true)
		{
			this._uneditedLayerProps = {};
			this.backup();
		}
	},
	_drawShape: function (prevLatlng) {
		if (!this._shape) {
			this._shape = new L.View(this._map, {
				startll: this._startLatLng,
				endll: prevLatlng,
				round: true
			}, this.options.shapeOptions);
			this._map.addLayer(this._shape);
		} else {
			this._shape.setBounds(prevLatlng);
		}
	},

	_fireCreatedEvent: function () {
		this._shape.finalize();
		this._map.removeLayer(this._shape);
		this.viewLayer.addLayer(this._shape);
		this.newViews.addLayer(this._shape);
		var view = this._shape;
		this._shape = null;
		var self = this;
		setTimeout(function () {
			self._map.fire('viewFocus', {layer: view});
		}, 0);
	}
});
