/*
 *  Copyright 2014 TWO SIGMA OPEN SOURCE, LLC
 *
 *  Licensed under the Apache License, Version 2.0 (the 'License');
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

(function() {
  'use strict';
  var module = angular.module('bk.controlPanel');

  module.directive('bkControlPanel', function(
        bkUtils, bkCoreManager, bkSession, bkMenuPluginManager, bkTrack, bkElectron, connectionManager, $location) {
    return {
      restrict: 'E',
      template: JST['controlpanel/controlpanel'](),
      controller: function($scope) {
        document.title = 'Beaker';
        var _impl = {
          name: 'bkControlApp',
          showAnonymousTrackingDialog: function() {
            $scope.$evalAsync(function() {
              $scope.isAllowAnonymousTracking = null;
            });
          }
        };

        bkCoreManager.setBkAppImpl(_impl);

        $scope.gotoControlPanel = function(event) {
          if (bkUtils.isMiddleClick(event)) {
            bkHelper.openWindow($location.absUrl() + '/beaker', 'control-panel');
          } else {
            location.reload();
          }
        };

        // setup menus
        bkMenuPluginManager.clear();
        if (window.beaker === undefined || window.beaker.isEmbedded === undefined) {
          bkUtils.httpGet('../beaker/rest/util/getControlPanelMenuPlugins')
            .success(function(menuUrls) {
              menuUrls.forEach(function(url) {
                bkMenuPluginManager.loadMenuPlugin(url);
              });
            });
        } else {
          var menues = window.beaker.getControlMenuItems();
          bkMenuPluginManager.attachMenus(menues);
        }

        $scope.getMenus = function() {
          return bkMenuPluginManager.getMenus();
        };

        if (bkUtils.isElectron){
          window.addEventListener('focus', function() {
            bkElectron.updateMenus(bkMenuPluginManager.getMenus());
          });
        }

        // actions for UI
        $scope.newNotebook = function() {
          bkCoreManager.newSession(false);
        };
        $scope.newEmptyNotebook = function() {
          bkCoreManager.newSession(true);
        };
        $scope.openTutorial = function() {
          bkCoreManager.openNotebook('config/tutorial.bkr', undefined, true);
        };

        $scope.getElectronMode = function() {
          return bkUtils.isElectron;
        };

        // ask for tracking permission
        $scope.isAllowAnonymousTracking = false;
        if ((window.beaker === undefined || window.beaker.isEmbedded === undefined) && bkTrack.isNeedPermission()) {
          bkUtils.httpGet('../beaker/rest/util/getPreference', {
            'preference': 'allow-anonymous-usage-tracking'
          }).then(function(allow) {
            switch (allow.data) {
              case 'true':
                $scope.isAllowAnonymousTracking = true;
                break;
              case 'false':
                $scope.isAllowAnonymousTracking = false;
                break;
              default:
                $scope.isAllowAnonymousTracking = null;
            }
          });
        } else {
          $scope.isAllowAnonymousTracking = true;
        }
        if (window.beaker === undefined || window.beaker.isEmbedded === undefined) {
          $scope.$watch('isAllowAnonymousTracking', function(newValue, oldValue) {
            if (newValue !== oldValue) {
              var allow = null;
              if (newValue) {
                allow = 'true';
                bkTrack.enable();
              } else if (newValue === false) {
                allow = 'false';
                bkTrack.disable();
              }
              bkUtils.httpPost('../beaker/rest/util/setPreference', {
                preferencename: 'allow-anonymous-usage-tracking',
                preferencevalue: allow
              });
            }
          });
        }
        $scope.showWhatWeLog = function() {
          return bkCoreManager.showModalDialog(
              function() {},
              JST['controlpanel/what_we_log']()
              );
        };

        var keydownHandler = function(e) {
          // Command H
          if (e.metaKey && e.which === 72 && bkUtils.isElectron) {
            bkElectron.minimize();
          }

          // Command W
          if (e.metaKey && e.which === 87 && bkUtils.isElectron) {
            bkElectron.closeWindow();
          }

          if (e.ctrlKey && e.shiftKey && (e.which === 78)) { // Ctrl + Shift + n
            bkUtils.fcall(function() {
              $scope.newNotebook();
            });
            return false;
          } else if (e.ctrlKey && (e.which === 78)) { // Ctrl + n
            bkUtils.fcall(function() {
              $scope.newEmptyNotebook();
            });
            return false;
          } else if (e.metaKey && !e.ctrlKey && e.shiftKey && (e.which === 78)) { // Cmd + Shift + n
            bkUtils.fcall(function() {
              $scope.newNotebook();
            });
            return false;
          } else if (e.metaKey && !e.ctrlKey && (e.which === 78)) { // Cmd + n
            bkUtils.fcall(function() {
              $scope.newEmptyNotebook();
            });
            return false;
          } else if ((e.which === 123) && bkUtils.isElectron) { // F12
            if (bkUtils.isElectron) {
              bkElectron.toggleDevTools();
            }
          }
        };
        $(document).bind('keydown', keydownHandler);

        var onDestroy = function() {
          $(document).unbind('keydown', keydownHandler);
        };
        $scope.$on('$destroy', onDestroy);

        // sessions list UI
        $scope.sessions = null;
        // get list of opened sessions
        $scope.reloadSessionsList = function() {
          bkSession.getSessions().then(function(sessions) {
            $scope.sessions = _.map(sessions, function(session, sessionId) {
              session.id = sessionId;
              return session;
            });
          });
        };
        $scope.reloadSessionsList();

        // Listen to backend for changes to session list
        $.cometd.subscribe('/sessionChange', function(reply){
          $scope.reloadSessionsList();
        });

        $scope.isSessionsListEmpty = function() {
          return _.isEmpty($scope.sessions);
        };

        var isDisconnected = function() {
          return connectionManager.isDisconnected();
        };

        bkUtils.addConnectedStatusListener(function(msg) {
          if (isDisconnected() && msg.successful) {
            connectionManager.onReconnected();
          }
          if (msg.failure) {
            connectionManager.onDisconnected();
          }
          $scope.disconnected = isDisconnected();
          return $scope.$digest();
        });
      }
    };
  });

})();
