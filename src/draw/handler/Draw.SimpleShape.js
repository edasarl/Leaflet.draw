L.SimpleShape = {};

L.Draw.SimpleShape = L.Draw.Feature.extend({
	options: {
		repeatMode: false
	},

	initialize: function (map, options) {
		this._endLabelText = L.drawLocal.draw.handlers.simpleshape.tooltip.end;

		L.Draw.Feature.prototype.initialize.call(this, map, options);
	},

	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);
		if (this._map) {
			//TODO refactor: move cursor to styles
			this._container.style.cursor = 'crosshair';
			this.tooltip.innerHTML = this._initialLabelText;
			this._map
				.on('mousedown', this._onMouseDown, this)
				.on('mousemove', this._onMouseMove, this);
		}
	},

	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);
		if (this._map) {
			//TODO refactor: move cursor to styles
			this._container.style.cursor = '';

			this._map
				.off('mousedown', this._onMouseDown, this)
				.off('mousemove', this._onMouseMove, this);

			L.DomEvent.off(document, 'mouseup', this._onMouseUp, this);

			// If the box element doesn't exist they must not have moved the mouse, so don't need to destroy/return
			if (this._shape) {
				this._map.removeLayer(this._shape);
				delete this._shape;
			}
		}
		this._isDrawing = false;
	},

	_onMouseDown: function (e) {
		if (!e.originalEvent.ctrlKey) {return; }
		this._map.dragging.disable();
		this._isDrawing = true;
		this._startLatLng = e.latlng;

		L.DomEvent
			.on(document, 'mouseup', this._onMouseUp, this)
			.preventDefault(e.originalEvent);
	},

	_onMouseMove: function (e) {
		var latlng = e.latlng;

		if (this._isDrawing) {
			this.tooltip.innerHTML = this._endLabelText;
			this._drawShape(latlng);
		}
	},

	_onMouseUp: function () {
		if (this._shape) {
			this._fireCreatedEvent();
		}
		this._map.dragging.enable();
		if (!this.options.repeatMode) {
			this.disable();
		} else {
			if (this._map) {
				L.DomEvent.off(document, 'mouseup', this._onMouseUp, this);

				// If the box element doesn't exist they must not have moved the mouse, so don't need to destroy/return
				if (this._shape) {
					this._map.removeLayer(this._shape);
					delete this._shape;
				}
			}
			this.tooltip.innerHTML = this._initialLabelText;
			this._isDrawing = false;
		}
	}
});