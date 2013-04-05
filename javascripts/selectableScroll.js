window.CloudBook = window.CloudBook || {};
window.CB = window.CloudBook;
CloudBook.settings = CloudBook.settings || {};

var _ = function(messageId) {return messageId;};

(function ($) {
  $.widget('CB.mainWidget', {
    options: {
      twentyfourHoursMode: true,
      languageCode: 'en',
      staticUrl: '/static/',
      socketUrl: 'http://localhost:8080',
      backendUrl: {
        listDevices: '/localfs/list_devices/',
        ejectDevice: '/localfs/eject/',
        fileList: '/localfs/filelist/'
      },
      eventPaths: {
        deviceOperations: '/localfs/device'
      },
      templateUrls: {
        tabContent: 'js/widgets/fileBrowser/tabContentTemplate.html'
      }
    },

    _create: function () {
      var self = this;
      this._initWidget();
      $(window).on('hashchange', function (event) {
        return self._onHashChange(event);
      });
    },

    _createContinue: function () {
      // Show the body here, because of the language file loading
      var self = this;
      this._initEventListeners();
      this.ignoreHashChange = false;
      this.element.tabs({
        beforeActivate: function (event, ui) {
          return self._onEventBeforeActivate(event, ui);
        },
        activate: function (event, ui) {
          return self._onEventActivate(event, ui);
        }
      }).addClass('ui-tabs-vertical ui-helper-clearfix');
      this.element.find('li').removeClass('ui-corner-top');
      this.tabWrapper = this.element.find('#tab-wrapper');
      this._initDevices();
      this.element.tabs('refresh');
      this._onHashChange();
      $('body').show();
    },

    _initEventListeners: function () {
      var self = this;
      this.socketHandler = new CloudBook.socketHandler();
      this.socketHandler.subscribe(this.options.eventPaths.deviceOperations, function (data) {
        self._onEventDevice(data);
      });
    },

    _initDevices: function () {
      var self = this;
      this.deviceList.forEach(function (device) {
        if (!device.devName)
          device.devName = device.name;
        self._addNewTab(device);
      });
    },

    _onEventDevice: function (data) {
      console.log('_onEventDevice', data);
      data.devName = data.name;
      if (data.action == 'add') {
        this._addNewTab(data);
        this._changeToTab(data.name);
      }
      if (data.action == 'remove') {
        this._removeTab(data);
      }
    },

    _addNewTab: function (device) {
      var self = this;
      var tabElement = $('<li><a class="icon-device"></a></li>');
      tabElement.attr('data-devname', device.devName);
      tabElement.find('a').text(device.label);
      tabElement.find('a').attr('href', '#' + device.devName);
      if (device.device_type == 'stick')
        tabElement.find('a').addClass('tabicon-usbdevice');
      if (device.device_type == 'sdcard')
        tabElement.find('a').addClass('tabicon-sdcard');
      var ejectButton = $('<a/>', {
        'class': 'eject-button',
        click: function (event) {
          self._onClickEject(event, this);
        }
      });
      ejectButton.data('device', device);
      tabElement.append(ejectButton);
      this.tabWrapper.append(tabElement);
      var widgetElement = $('<div/>');
      widgetElement.attr('id', device.devName);
      widgetElement.append(this.templates.tabContent);
      widgetElement.viewController({
        twentyfourHoursMode: this.options.twentyfourHoursMode,
        controllerWidget: this,
        devName: device.devName,
        templates: this.options.templates,
        backendUrl: this.options.backendUrl,
        readOnly: device.mode != 'rw',
        currentPathArray: [] // If we don't init this here, for some weird reason the directories from _another_widget_ (probably the last used one) would be used, and thus inited false
      });
      this.element.append(widgetElement);
      this.element.tabs('refresh');
    },

    _onClickEject: function (event, element) {
      var jqElement = $(element);
      var device = jqElement.data('device');
      console.log(device);
    },

    _removeTab: function (device) {
      var activeInfo = this._getActiveInfo();
      var isActive = false;
      if (activeInfo.devName == device.devName)
        isActive = true;
      this.tabWrapper.find('li[aria-controls=' + device.devName + ']').remove();
      this.element.find('div[id=' + device.devName + ']').remove();
      this.element.tabs('refresh');
      if (isActive) {
        if (this.tabWrapper.find('li').length) {
          var tabName = this.tabWrapper.find('li').attr('aria-controls');
          this._changeToTab(tabName);
        } else {
          // Remove the hashtag silently
          this.ignoreHashChange = true;
          window.location.hash = '';
        }
      }
    },

    _initWidget: function () {
      var self = this;
      $.when(
        $.ajax({
          url: this.options.staticUrl + 'locales/' + this.options.languageCode + '/jsMessages.json',
          dataType: 'json'
        }),
        $.ajax({
          url: this.options.backendUrl.listDevices,
          dataType: 'json'
        }),
        $.ajax({
          url: this.options.staticUrl + this.options.templateUrls.tabContent,
          dataType: 'html'
        })
      ).then(function (localeData, deviceList, tabContentTemplate) {
        CloudBook.gettext = new Gettext({
          domain: 'jsMessages',
          locale_data: localeData[0]
        });
        _ = function(messageId) {
          return CloudBook.gettext.gettext(messageId);
        };
        self.deviceList = deviceList[0];
        self.templates = {
          tabContent: tabContentTemplate[0]
        };
        self._createContinue();
      });
    },

    _onHashChange: function (event) {
      if (!this.ignoreHashChange) {
        var pathArray = window.location.hash.substr(1).split('/');
        if (pathArray && pathArray[0] !== '') {
          var devName = pathArray.shift();
          if (pathArray[0] === '') // First element empty
            pathArray.shift();
          var widgetInfo = this._getByDevName(devName);
          widgetInfo.panelElement.viewController('option', 'currentPathArray', pathArray);
          var activeInfo = this._getActiveInfo();
          if (devName != activeInfo.devName)
            this._changeToTab(devName);
        }
      }
      this.ignoreHashChange = false;
    },

    _onEventBeforeActivate: function (event, ui) {
      var newPanelWidget = ui.newPanel.data('CB-viewController');
      newPanelWidget.beforeActivate();
      var handlerWidgetInstance = ui.oldPanel.data('CB-viewController');
      if (handlerWidgetInstance && handlerWidgetInstance.deactivate)
        handlerWidgetInstance.deactivate(event, ui);
    },

    _onEventActivate: function (event, ui) {
      var handlerWidgetInstance = ui.newPanel.data('CB-viewController');
      if (handlerWidgetInstance && handlerWidgetInstance.activate)
        handlerWidgetInstance.activate(event, ui);
      this.updateHash();
    },

    _changeToTab: function (devName) {
      var widgetInfo = this._getByDevName(devName);
      // var tabNumber = parseInt(this.tabWrapper.find('li[data-devname=' + devName + ']').attr('aria-labelledby').substr('ui-id-'.length), 0);
      var tabElement = this.tabWrapper.find('li[data-devname=' + devName + ']');
      var tabNumber = this.tabWrapper.find('li').index(tabElement);
      if (tabNumber != -1)
        this.element.tabs('option', 'active', tabNumber);
    },

    _getByDevName: function (devName) {
      var tabElement = this.tabWrapper.find('li[data-devname=' + devName + ']');
      var panelElement = this.element.find('div#' + devName);
      return {
        tabElement: tabElement,
        panelElement: panelElement
      };
    },

    _getActiveInfo: function () {
      var activeTabNumber = this.element.tabs('option', 'active');
      var tabElement = activeTabNumber !== false ? this.tabWrapper.find('li').eq(activeTabNumber) : $();
      var devName = tabElement.attr('data-devname');
      var panelElement = devName ? this.element.find('>#' + devName) : $();
      return {
        panelElement: panelElement,
        devName: devName,
        tabElement: tabElement
      };
    },

    updateHash: function () {
      var activeInfo = this._getActiveInfo();
      var currentPathArray = activeInfo.panelElement.viewController('option', 'currentPathArray');
      var path = '#' + activeInfo.devName;
      if (currentPathArray.join('/') !== '')
        path += '/' + currentPathArray.join('/');
      if (window.location.hash != path) {
        this.ignoreHashChange = true;
        window.location.hash = path;
      }
    }

  });
})(jQuery);