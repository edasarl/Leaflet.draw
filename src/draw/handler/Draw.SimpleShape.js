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
			this.panel.show(true);
			this.panel.updateToolTip(this._initialLabelText);
			this._map
				.on('click', this._onMouseDown, this)
				.on('mousemove', this._onMouseMove, this);
		}
	},

	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);
		if (this._map) {
			//TODO refactor: move cursor to styles
			this._container.style.cursor = '';
			this.panel.hide();

			this._map
				.off('click', this._onMouseDown, this)
				.off('mousemove', this._onMouseMove, this);

			// If the box element doesn't exist they must not have moved the mouse, so don't need to destroy/return
			if (this._shape) {
				this._map.removeLayer(this._shape);
				delete this._shape;
			}
		}
		this._isDrawing = false;
	},
	_onMouseDown: function (e) {
		if (this._isDrawing) {
			if (this._shape) {
				this._fireCreatedEvent();
			}
			if (!this.options.repeatMode) {
				this.disable();
			} else {
				if (this._map) {

					// If the box element doesn't exist they must not have moved the mouse, so don't need to destroy/return
					if (this._shape) {
						this._map.removeLayer(this._shape);
						delete this._shape;
					}
				}
				this.panel.updateToolTip(this._initialLabelText);
				this._isDrawing = false;
			}
			return;
		} else {
			this._isDrawing = true;
			this._startLatLng = e.latlng;
			L.DomEvent.preventDefault(e.originalEvent);
			this.panel.updateToolTip(this._endLabelText);
		}
	},

	_onMouseMove: function (e) {
		var latlng = e.latlng;

		if (this._isDrawing) {
			this._drawShape(latlng);
		}
	}
});