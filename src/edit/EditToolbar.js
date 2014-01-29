/*L.Map.mergeOptions({
	editControl: true
});*/

L.EditToolbar = L.Toolbar.extend({
	options: {
		edit: {
			selectedPathOptions: {
				color: '#fe57a1', /* Hot pink all the things! */
				opacity: 0.6,
				dashArray: '10, 10',

				fill: true,
				fillColor: '#fe57a1',
				fillOpacity: 0.1
			}
		},
		remove: {},
		featureGroup: null /* REQUIRED! TODO: perhaps if not set then all layers on the map are selectable? */
	},

	initialize: function (options) {
		// Need to set this manually since null is an acceptable value here
		if (options.edit) {
			if (typeof options.edit.selectedPathOptions === 'undefined') {
				options.edit.selectedPathOptions = this.options.edit.selectedPathOptions;
			}
			options.edit = L.extend({}, this.options.edit, options.edit);
		}

		if (options.remove) {
			options.remove = L.extend({}, this.options.remove, options.remove);
		}

		if (options.style) {
			options.style = L.extend({}, this.options.style, options.style);
		}

		this._toolbarClass = 'leaflet-draw-edit';
		L.Toolbar.prototype.initialize.call(this, options);

		this._selectedFeatureCount = 0;
	},

	getModeHandlers: function (map) {
		var featureGroup = this.options.featureGroup;
		return [
			{
				enabled: this.options.edit,
				handler: new L.EditToolbar.Edit(map, {
					featureGroup: featureGroup,
					selectedPathOptions: this.options.edit.selectedPathOptions
				}),
				title: L.drawLocal.edit.toolbar.buttons.edit
			},
			{
				enabled: this.options.navigate,
				handler: new L.EditToolbar.Navigate(map, {}),
				title: L.drawLocal.edit.toolbar.buttons.navigate
			},
			{
				enabled: this.options.remove,
				handler: new L.EditToolbar.Delete(map, {
					featureGroup: featureGroup
				}),
				title: L.drawLocal.edit.toolbar.buttons.remove
			},
			{
				enabled: this.options.style,
				handler: new L.EditToolbar.Style(map, {
					featureGroup: featureGroup,
					panel: this.options.style.panel
				}),
				title: L.drawLocal.edit.toolbar.buttons.style
			}
		];
	},

	getActions: function () {
		return [];
	},

	addToolbar: function (map) {
		var container = L.Toolbar.prototype.addToolbar.call(this, map);

		this._checkDisabled();

		this.options.featureGroup.on('layeradd layerremove', this._checkDisabled, this);
		if (this._modes.navigate) {
			var self = this;
			map.on('navigation', function () {
				self._modes.navigate.handler.enable();
			});
		}
		return container;
	},

	removeToolbar: function () {
		this.options.featureGroup.off('layeradd layerremove', this._checkDisabled, this);

		L.Toolbar.prototype.removeToolbar.call(this);
	},
	cancel: function () {
		if (!this.enabled()) { return; }
		this._activeMode.handler.revertLayers();
	},
	disable: function () {
		if (!this.enabled()) { return; }

		this._activeMode.handler.save();
		L.Toolbar.prototype.disable.call(this);
	},

	_save: function () {
		this._activeMode.handler.save();
	},

	_checkDisabled: function () {
		// var featureGroup = this.options.featureGroup;
		var hasLayers = true,//featureGroup.getLayers().length !== 0,
			button;

		if (this.options.edit) {
			button = this._modes[L.EditToolbar.Edit.TYPE].button;

			if (hasLayers) {
				L.DomUtil.removeClass(button, 'leaflet-disabled');
			} else {
				L.DomUtil.addClass(button, 'leaflet-disabled');
			}

			button.setAttribute(
				'title',
				hasLayers ?
				L.drawLocal.edit.toolbar.buttons.edit
				: L.drawLocal.edit.toolbar.buttons.editDisabled
			);
		}

		if (this.options.remove) {
			button = this._modes[L.EditToolbar.Delete.TYPE].button;

			if (hasLayers) {
				L.DomUtil.removeClass(button, 'leaflet-disabled');
			} else {
				L.DomUtil.addClass(button, 'leaflet-disabled');
			}

			button.setAttribute(
				'title',
				hasLayers ?
				L.drawLocal.edit.toolbar.buttons.remove
				: L.drawLocal.edit.toolbar.buttons.removeDisabled
			);
		}
		if (this.options.style) {
			button = this._modes[L.EditToolbar.Style.TYPE].button;

			if (hasLayers) {
				L.DomUtil.removeClass(button, 'leaflet-disabled');
			} else {
				L.DomUtil.addClass(button, 'leaflet-disabled');
			}

			button.setAttribute(
				'title',
				hasLayers ?
				L.drawLocal.edit.toolbar.buttons.style
				: L.drawLocal.edit.toolbar.buttons.styleDisabled
			);
		}
	}
});
