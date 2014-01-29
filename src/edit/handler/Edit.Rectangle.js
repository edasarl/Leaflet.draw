L.Edit = L.Edit || {};

L.Edit.Rectangle = L.Edit.SimpleShape.extend({
	_zoomToResize: function (e) {
		var marker = e.target,
			latlng = marker.getLatLng();
		var zoom = this._shape._zoom;
		var map = this._map;
		setTimeout(function () {
			map.setZoomAround(latlng, zoom);
		}, 0);
	},

	addHooks: function () {
		L.Edit.SimpleShape.prototype.addHooks.call(this);
		for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
			var bindmarker = this._resizeMarkers[i];
			bindmarker.on('mousedown', this._zoomToResize, this);
		}

	},
	removeHooks: function () {
		for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
			var bindmarker = this._resizeMarkers[i];
			bindmarker.off('mousedown', this._zoomToResize, this);
		}
		L.Edit.SimpleShape.prototype.removeHooks.call(this);
	},
	//patch for rectangles moving size when translated
	_createMoveMarker: function () {
		var bounds = this._shape.getBounds(),
			center = this._map.getRealCenter(bounds);

		this._moveMarker = this._createMarker(center, this.options.moveIcon);
	},

	_createResizeMarker: function () {
		var corners = this._getCorners();

		this._resizeMarkers = [];

		for (var i = 0, l = corners.length; i < l; i++) {
			this._resizeMarkers.push(this._createMarker(corners[i], this.options.resizeIcon));
			// Monkey in the corner index as we will need to know this for dragging
			this._resizeMarkers[i]._cornerIndex = i;
		}
	},

	_onMarkerDragStart: function (e) {
		// this._map.addLayer(this._shape._icon);
		L.Edit.SimpleShape.prototype._onMarkerDragStart.call(this, e);

		// Save a reference to the opposite point
		var corners = this._getCorners(),
			marker = e.target,
			currentCornerIndex = marker._cornerIndex;

		this._oppositeCorner = corners[(currentCornerIndex + 2) % 4];

		this._toggleCornerMarkers(0, currentCornerIndex);
	},

	_onMarkerDragEnd: function (e) {
		var marker = e.target,
			bounds, center;

		// Reset move marker position to the center
		if (marker === this._moveMarker) {
			bounds = this._shape.getBounds();
			center = this._map.getRealCenter(bounds);

			marker.setLatLng(center);
		}

		this._toggleCornerMarkers(1);

		this._repositionCornerMarkers();

		L.Edit.SimpleShape.prototype._onMarkerDragEnd.call(this, e);
		var myIcon =  L.divIcon({
			className: 'view-button view-preference',
		});
		this._shape._icon.setIcon(myIcon);
		// this._map.removeLayer(this._shape._icon);
	},

	_move: function (newCenter) {
		var latlngs = this._shape.getLatLngs(),
			bounds = this._shape.getBounds(),
			// center = this._map.getRealCenter(bounds),
			offset, newLatLngs = [];

		var northEast = this._map.project(bounds._northEast),
			southWest = this._map.project(bounds._southWest),
			projectedCenter = new L.Point((northEast.x + southWest.x) / 2, (northEast.y + southWest.y) / 2),
			projectedNewCenter = this._map.project(newCenter);

		// Offset the latlngs to the new center
		for (var i = 0, l = latlngs.length; i < l; i++) {
			var current = this._map.project(latlngs[i]);
			offset = [current.x - projectedCenter.x, current.y - projectedCenter.y];
			newLatLngs.push(this._map.unproject([projectedNewCenter.x + offset[0], projectedNewCenter.y + offset[1]]));
		}

		this._shape.setLatLngs(newLatLngs);
		bounds = this._shape.getBounds();
		var iconLatLng = [bounds._southWest.lat, bounds._northEast.lng];
		this._shape._icon.setLatLng(iconLatLng);

		// Respoition the resize markers
		this._repositionCornerMarkers();
	},

	_resize: function (latlng) {
		var roundedBounds = this._map._roundLatlng(this._moveMarker.getLatLng(), latlng, 5, 20);
		this._shape.setBounds(L.latLngBounds(roundedBounds[0], roundedBounds[1]));

		var zoom = this._shape._zoom;
		var bounds = this._shape.getBounds();
		var northEast = this._map.project(bounds._northEast, zoom),
			southWest = this._map.project(bounds._southWest, zoom),
			width =  Math.round(northEast.x - southWest.x),
			height = Math.round(southWest.y - northEast.y);

		var iconLatLng = [bounds._southWest.lat, bounds._northEast.lng];
		this._shape._icon.setLatLng(iconLatLng);
		var fullScreen = (width === 40 && height === 40);
		var htmlContent = fullScreen ? 'Plein écran': width + 'x' + height;
		var myIcon = L.divIcon({
			html: htmlContent + ' z=' + zoom,
			// iconSize: L.Point(40,40),
			iconAnchor: [110, -10],
			className: 'coords-icon'
		});
		this._shape._icon.setIcon(myIcon);
		this._shape._icon.width = width;
		this._shape._icon.height = height;
		this._shape._icon.fullscreen = fullScreen;

		// Respoition the move marker
		bounds = this._shape.getBounds();
		this._moveMarker.setLatLng(this._map.getRealCenter(bounds));
	},

	_getCorners: function () {
		var bounds = this._shape.getBounds(),
			nw = bounds.getNorthWest(),
			ne = bounds.getNorthEast(),
			se = bounds.getSouthEast(),
			sw = bounds.getSouthWest();

		return [nw, ne, se, sw];
	},

	_toggleCornerMarkers: function (opacity) {
		for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
			this._resizeMarkers[i].setOpacity(opacity);
		}
	},

	_repositionCornerMarkers: function () {
		var corners = this._getCorners();

		for (var i = 0, l = this._resizeMarkers.length; i < l; i++) {
			this._resizeMarkers[i].setLatLng(corners[i]);
		}
	}
});

L.Rectangle.addInitHook(function () {
	if (L.Edit.Rectangle) {
		this.editing = new L.Edit.Rectangle(this);

		if (this.options.editable) {
			this.editing.enable();
		}
	}
});
