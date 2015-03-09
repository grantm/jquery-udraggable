/*
 * jQuery udraggable plugin v0.3.0
 * Copyright (c) 2013-2014 Grant McLean (grant@mclean.net.nz)
 *
 * Homepage: https://github.com/grantm/jquery-udraggable
 *
 * Dual licensed under the MIT and GPL (v2.0 or later) licenses:
 *   http://opensource.org/licenses/MIT
 *   http://opensource.org/licenses/GPL-2.0
 *
 * This library requires Michael S. Mikowski's unified mouse and touch
 * event plugin: https://github.com/mmikowski/jquery.event.ue
 *
 */

(function($) {
    "use strict";

    var floor = Math.floor;
    var min   = Math.min;
    var max   = Math.max;

    window.requestAnimationFrame = window.requestAnimationFrame || function(work) {
        return setTimeout(work, 10);
    };

    window.cancelAnimationFrame = window.cancelAnimationFrame || function(id) {
        return clearTimeout(id);
    };


    // Constructor function

    var UDraggable = function (el, options) {
        var that = this;
        this.el  = el;
        this.$el = $(el);
        this.options = $.extend({}, $.fn.udraggable.defaults, options);
        this.positionElement  = this.options.positionElement  || this.positionElement;
        this.getStartPosition = this.options.getStartPosition || this.getStartPosition;
        this.normalisePosition = this.options.normalisePosition || this.normalisePosition;
        this.updatePositionFrameHandler = function() {
            delete that.queuedUpdate;
            var pos = that.ui.position;
            that.positionElement(that.$el, that.started, pos.left, pos.top);
            if (that.options.dragUpdate) {
                that.options.dragUpdate.apply(that.el, [that.ui]);
            }
        };
        this.queuePositionUpdate = function() {
            if (!that.queuedUpdate) {
                that.queuedUpdate = window.requestAnimationFrame(that.updatePositionFrameHandler);
            }
        };
        this.init();
    };

    UDraggable.prototype = {

        constructor: UDraggable,

        init: function() {
            var that = this;
            this.disabled = false;
            this.started = false;
            this.normalisePosition();
            var $target = this.options.handle ?
                          this.$el.find( this.options.handle ) :
                          this.$el;
            if (this.options.longPress) {
                $target
                    .on('uheldstart.udraggable', function(e) { that.start(e); })
                    .on('uheldmove.udraggable',  function(e) { that.move(e);  })
                    .on('uheldend.udraggable',   function(e) { that.end(e);   });
            }
            else {
                $target
                    .on('udragstart.udraggable', function(e) { that.start(e); })
                    .on('udragmove.udraggable',  function(e) { that.move(e);  })
                    .on('udragend.udraggable',   function(e) { that.end(e);   });
            }
        },

        destroy: function() {
            var $target = this.options.handle ?
                          this.$el.find( this.options.handle ) :
                          this.$el;
            $target.off('.udraggable');
            this.$el.removeData('udraggable');
        },

        disable: function() {
            this.disabled = true;
        },

        enable: function() {
            this.disabled = false;
        },

        option: function() {
            var name;
            if (arguments.length === 0) {
                return this.options;
            }
            if (arguments.length === 2) {
                this.options[ arguments[0] ] = arguments[1];
                return;
            }
            if (arguments.length === 1) {
                if (typeof arguments[0] === 'string') {
                    return this.options[ arguments[0] ];
                }
                if (typeof arguments[0] === 'object') {
                    for(name in arguments[0]) {
                        if (arguments[0].hasOwnProperty(name)) {
                            this.options[name] = arguments[0][name];
                        }
                    }
                }
            }
            if (this.options.containment) {
                this._initContainment();
            }
        },

        normalisePosition: function() {
            var pos = this.$el.position();
            this.$el.css({
                position: 'absolute',
                top: pos.top,
                left: pos.left,
                right: 'auto',
                bottom: 'auto'
            });
        },

        start: function(e) {
            if (this.disabled) {
                return;
            }
            var start = this.getStartPosition(this.$el);
            this._initContainment();
            this.ui = {
                helper:           this.$el,
                offset:           { top: start.y, left: start.x},
                originalPosition: { top: start.y, left: start.x},
                position:         { top: start.y, left: start.x},
            };
            if (this.options.longPress) {
                this._start(e);
            }
            return this._stopPropagation(e);
        },

        move: function(e) {
            if (this.disabled || (!this.started && !this._start(e))) {
                return;
            }
            var delta_x = e.px_current_x - e.px_start_x;
            var delta_y = e.px_current_y - e.px_start_y;
            var axis = this.options.axis;
            if (axis  &&  axis === "x") {
                delta_y = 0;
            }
            if (axis  &&  axis === "y") {
                delta_x = 0;
            }
            var cur = {
                left: this.ui.originalPosition.left,
                top:  this.ui.originalPosition.top
            };
            if (!axis  ||  (axis === "x")) {
                cur.left += delta_x;
            }
            if (!axis  ||  (axis === "y")) {
                cur.top += delta_y;
            }
            this._applyGrid(cur);
            this._applyContainment(cur);
            var pos = this.ui.position;
            if ((cur.top !== pos.top)  ||  (cur.left !== pos.left)) {
                this.ui.position.left = cur.left;
                this.ui.position.top  = cur.top;
                this.ui.offset.left   = cur.left;
                this.ui.offset.top    = cur.top;
                if (this.options.drag) {
                    this.options.drag.apply(this.el, [e, this.ui]);
                }
                this.queuePositionUpdate();
            }
            return this._stopPropagation(e);
        },

        end: function(e) {
            if (this.started || this._start(e)) {
                this.$el.removeClass("udraggable-dragging");
                this.started = false;
                if (this.queuedUpdate) {
                    window.cancelAnimationFrame(this.queuedUpdate);
                }
                this.updatePositionFrameHandler();
                if (this.options.stop) {
                    this.options.stop.apply(this.el, [e, this.ui]);
                }
            }
            return this._stopPropagation(e);
        },

        // helper methods

        _stopPropagation: function(e) {
            e.stopPropagation();
            e.preventDefault();
            return false;
        },

        _start: function(e) {
            if (!this._mouseDistanceMet(e) || !this._mouseDelayMet(e)) {
                return;
            }
            this.started = true;
            this.queuePositionUpdate();
            if (this.options.start) {
                this.options.start.apply(this.el, [e, this.ui]);
            }
            this.$el.addClass("udraggable-dragging");
            return true;
        },

        _mouseDistanceMet: function(e) {
            return max(
                Math.abs(e.px_start_x - e.px_current_x),
                Math.abs(e.px_start_y - e.px_current_y)
            ) >= this.options.distance;
        },

        _mouseDelayMet: function(e) {
            return e.ms_elapsed > this.options.delay;
        },

        _initContainment: function() {
            var o = this.options;
            var $c, ce;

            if (!o.containment) {
                this.containment = null;
                return;
            }

            if (o.containment.constructor === Array) {
                this.containment = o.containment;
                return;
            }

            if (o.containment === "parent") {
                o.containment = this.$el.offsetParent();
            }

            $c = $( o.containment );
            ce = $c[ 0 ];
            if (!ce) {
                return;
            }

            this.containment = [
                0,
                0,
                $c.innerWidth() - this.$el.outerWidth(),
                $c.innerHeight() - this.$el.outerHeight(),
            ];
        },

        _applyGrid: function(cur) {
            if (this.options.grid) {
                var gx = this.options.grid[0];
                var gy = this.options.grid[1];
                cur.left = floor( (cur.left + gx / 2) / gx ) * gx;
                cur.top  = floor( (cur.top  + gy / 2) / gy ) * gy;
            }
        },

        _applyContainment: function(cur) {
            var cont = this.containment;
            if (cont) {
                cur.left = min( max(cur.left, cont[0]), cont[2] );
                cur.top  = min( max(cur.top,  cont[1]), cont[3] );
            }
        },

        getStartPosition: function($el) {
            return {
                x: parseInt($el.css('left'), 10) || 0,
                y: parseInt($el.css('top'),  10) || 0
            };
        },

        positionElement: function($el, dragging, left, top) {
            $el.css({ left: left, top: top });
        }

    };


    // jQuery plugin function

    $.fn.udraggable = function(option) {
        var args = Array.prototype.slice.call(arguments, 1);
        var results = [];
        this.each(function () {
            var $this = $(this);
            var data = $this.data('udraggable');
            if (!data) {
                data = new UDraggable(this, option);
                $this.data('udraggable', data);
            }
            if (typeof option === 'string') {  // option is a method - call it
                if(typeof data[option] !== 'function') {
                    throw "jquery.udraggable has no '" + option + "' method";
                }
                var result = data[option].apply(data, args);
                if (result !== undefined) {
                    results.push( result );
                }
            }
        });
        return results.length > 0 ? results[0] : this;
    };

    $.fn.udraggable.defaults = {
         axis:        null,
         delay:       0,
         distance:    0,
         longPress:   false,
         // callbacks
         drag:        null,
         start:       null,
         stop:        null
    };


})(jQuery);

