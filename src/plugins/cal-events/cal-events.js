/**
 * @title WET-BOEW Events Calendar
 * @overview Dynamically generates a calendar interface for navigating a list of events.
 * @license wet-boew.github.io/wet-boew/License-en.html / wet-boew.github.io/wet-boew/Licence-fr.html
 * @author WET Community
 */
(function( $, window, wb ) {
"use strict";

/*
 * Variable and function definitions.
 * These are global to the plugin - meaning that they will be initialized once per page,
 * not once per instance of plugin on the page. So, this is a good place to define
 * variables that are common to all instances of the plugin on a page.
 */
var pluginName = "wb-calevt",
	selector = "." + pluginName,
	calendarSelector = selector + "-cal",
	initedClass = pluginName + "-inited",
	initEvent = "wb-init" + selector,
	setFocusEvent = "setfocus.wb",
	evDetails = "ev-details",
	$document = wb.doc,
	i18n, i18nText,

	/**
	 * @method init
	 * @param {jQuery DOM element} $elm The plugin element
	 */
	init = function( $elm ) {

		// Only initialize the element once
		if ( !$elm.hasClass( initedClass ) ) {
			wb.remove( selector );
			$elm.addClass( initedClass );

			// Only initialize the i18nText once
			if ( !i18nText ) {
				i18n = wb.i18n;
				i18nText = {
					monthNames: i18n( "mnths" ),
					calendar: i18n( "cal" )
				};
			}

			// Load ajax content
			$.when.apply($, $.map( $elm.find( "[data-calevt]" ), getAjax))
				.always( function() {
					processEvents( $elm );
				});
		}
	},

	getAjax = function( ajaxContainer ) {
		var $ajaxContainer = $( ajaxContainer ),
			urls = $ajaxContainer.data( "calevt" ).split( /\s+/ ),
			dfd = $.Deferred(),
			len = urls.length,
			promises = [],
			i, appendData;

		appendData = function( data ) {
			$ajaxContainer.append( $.trim( data ) );
		};

		for ( i = 0; i < len; i += 1 ) {
			promises.push( $.get( urls[ i ], appendData, "html" ) );
		}

		$.when.apply( $, promises ).always(function() {
			dfd.resolve();
		});

		return dfd.promise();
	},

	processEvents = function( $elm ) {
		var date = new Date(),
			year = date.getFullYear(),
			month = date.getMonth(),
			elmYear = $elm.find( ".year" ),
			elmMonth = $elm.find( ".month" ),
			events, containerId, $containerId;

		if ( elmYear.length > 0 && elmMonth.length > 0 ) {

			// We are going to assume this is always a number.
			year = elmYear.text();

			month = elmMonth.hasClass( "textformat" ) ? $.inArray( elmMonth.text(), i18nText.monthNames ) : elmMonth.text() - 1;
		}

		events = getEvents( $elm );
		containerId = $elm.data( "calevtSrc" );
		$containerId = $( "#" + containerId ).addClass( calendarSelector );

		$document.on( "displayed.wb-cal", "#" + containerId, function( event, year, month, days ) {
			addEvents( year, month, days, containerId, events.list );
			showOnlyEventsFor( year, month, containerId );
		});
		$document.trigger( "create.wb-cal", [
				containerId,
				year,
				month,
				true,
				events.minDate,
				events.maxDate
			]
		);
		$containerId.attr( "aria-label", i18nText.calendar );
	},

	daysBetween = function( dateLow, dateHigh ) {

		// Simplified conversion to date object
		var date1 = wb.date.convert( dateLow ),
			date2 = wb.date.convert( dateHigh ),
			dstAdjust = 0,
			oneMinute = 1000 * 60,
			oneDay = oneMinute * 60 * 24,
			diff;

		// Equalize times in case date objects have them
		date1.setHours( 0 );
		date1.setMinutes( 0 );
		date1.setSeconds( 0 );
		date2.setHours( 0 );
		date2.setMinutes( 0 );
		date2.setSeconds( 0 );

		// Take care of spans across Daylight Saving Time changes
		if ( date2 > date1 ) {
			dstAdjust = ( date2.getTimezoneOffset() - date1.getTimezoneOffset() ) * oneMinute;
		} else {
			dstAdjust = ( date1.getTimezoneOffset() - date2.getTimezoneOffset() ) * oneMinute;
		}
		diff = Math.abs( date2.getTime() - date1.getTime() ) - dstAdjust;
		return Math.ceil( diff / oneDay );
	},

	getEvents = function( obj ) {
		var directLinking = !( $( obj ).hasClass( "evt-anchor" ) ),
			events = {
				minDate: null,
				maxDate: null,
				iCount: 0,
				list: [
					{
						a: 1
					}
				]
			},
			objEventsList = null;

		if ( obj.find( "ol" ).length > 0 ) {
			objEventsList = obj.find( "ol" );
		} else if ( obj.find( "ul" ).length > 0 ) {
			objEventsList = obj.find( "ul" );
		}

		if ( objEventsList.length > 0 ) {
			objEventsList.children( "li" ).each(function() {
				var event = $( this ),
					objTitle = event.find( "*:header:first" ),
					title = objTitle.text(),
					origLink = event.find( "a" ).first(),
					link = origLink.attr( "href" ),
					linkId, date, tCollection, $tCollection, tCollectionTemp,
					strDate1, strDate2, strDate, z, zLen, className;

				/*
				 * Modification direct-linking or page-linking
				 *	- added the ability  to have class set the behaviour of the links
				 *	- default is to use the link of the item as the event link in the calendar
				 *	- 'evt-anchor' class dynamically generates page anchors on the links it maps to the event
				 */
				if ( !directLinking ) {
					linkId = event.attr( "id" ) || wb.guid();
					event.attr( "id", linkId );

					/*
					 * Fixes IE tabbing error:
					 * http://www.earthchronicle.com/ECv1point8/Accessibility01IEAnchoredKeyboardNavigation.aspx
					 */
					if ( wb.ie ) {
						event.attr( "tabindex", "-1" );
					}
					link = "#" + linkId;
				}

				/*
				 * Modification XHTML 1.0 strict compatible
				 *   - XHTML 1.0 Strict does not contain the time element
				 */
				date = new Date();
				tCollection = event.find( "time, span.datetime" );

				/*
				 * Date spanning capability
				 *   - since there maybe some dates that are capable of spanning over months we need to identify them
				 *     the process is see how many time nodes are in the event. 2 nodes will trigger a span
				 */
				if ( tCollection.length > 1 ) {

					// This is a spanning event
					tCollectionTemp = tCollection[ 0 ];
					strDate1 = tCollectionTemp.nodeName.toLowerCase() === "time" ?
						$( tCollectionTemp ).attr( "datetime" ).substr( 0, 10 ).split( "-" ) :
						$( tCollectionTemp ).attr( "class" ).match( /datetime\s+\{date\:\s*(\d+-\d+-\d+)\}/ )[ 1 ].substr( 0, 10 ).split( "-" );

					tCollectionTemp = tCollection[ 1 ];
					strDate2 = tCollectionTemp.nodeName.toLowerCase() === "time" ?
						$( tCollectionTemp ).attr( "datetime" ).substr( 0, 10 ).split( "-" ) :
						$( tCollectionTemp ).attr( "class" ).match( /datetime\s+\{date\:\s*(\d+-\d+-\d+)\}/ )[ 1 ].substr( 0, 10 ).split( "-" );

					// Convert to zero-base month
					strDate1[ 1 ] = strDate1[ 1 ] - 1;
					strDate2[ 1 ] = strDate2[ 1 ] - 1;

					date.setFullYear( strDate1[ 0 ], strDate1[ 1 ], strDate1[ 2 ] );

					// Now loop in events to load up all the days that it would be on tomorrow.setDate(tomorrow.getDate() + 1);
					for ( z = 0, zLen = daysBetween( strDate1, strDate2 ); z <= zLen; z += 1 ) {
						if ( events.minDate === null || date < events.minDate ) {
							events.minDate = date;
						}
						if ( events.maxDate === null || date > events.maxDate ) {
							events.maxDate = date;
						}

						events.list[ events.iCount ] = {
							title: title,
							date: new Date( date.getTime() ),
							href: link
						};

						date = new Date( date.setDate( date.getDate() + 1 ) );

						// Add a viewfilter
						className = "filter-" + ( date.getFullYear() ) + "-" +
							wb.string.pad( date.getMonth() + 1, 2 );
						if ( !objTitle.hasClass( className ) ) {
							objTitle.addClass( className );
						}
						events.iCount += 1;
					}
				} else if ( tCollection.length === 1 ) {
					$tCollection = $( tCollection[ 0 ] );
					strDate = ( $tCollection.get( 0 ).nodeName.toLowerCase() === "time" ) ?
						$tCollection.attr( "datetime" ).substr( 0, 10 ).split( "-" ) :
						$tCollection.attr( "class" ).match(/datetime\s+\{date\:\s*(\d+-\d+-\d+)\}/)[ 1 ].substr( 0, 10 ).split( "-" );

					date.setFullYear( strDate[ 0 ], strDate[ 1 ] - 1, strDate[ 2 ] );

					if ( events.minDate === null || date < events.minDate ) {
						events.minDate = date;
					}
					if ( events.maxDate === null || date > events.maxDate ) {
						events.maxDate = date;
					}
					events.list[ events.iCount ] = {
						title: title,
						date: date,
						href: link
					};

					// Add a viewfilter
					className = "filter-" + ( date.getFullYear() ) + "-" + wb.string.pad( date.getMonth() + 1, 2 );
					if ( !objTitle.hasClass( className ) ) {
						objTitle.addClass( className );
					}
					events.iCount += 1;
				}

			// End of loop through objects/events
			});
		}

		window.events = events;
		return events;
	},

	keyboardNavEvents = function( event ) {
		var $this = $( this ),
			length, $children;

		switch ( event.keyCode ) {

		// Up arrow
		case 38:
			$children = $this.closest( "ul" ).children( "li" );
			length = $children.length;
			$children.eq( ( $this.closest( "li" ).index() - 1 ) % length )
				.children( "a" ).trigger( setFocusEvent );
			return false;

		// Down arrow
		case 40:
			$children = $this.closest( "ul" ).children( "li" );
			length = $children.length;
			$children.eq( ( $this.closest( "li" ).index() + 1 ) % length )
				.children( "a" ).trigger( setFocusEvent );
			return false;

		// Left arrow
		case 37:
			$this.closest( "ol" )
				.children( "li:lt(" + $this.closest( "li[id^=cal-]" ).index() + ")" )
				.children( "a" ).last().trigger( setFocusEvent );
			return false;

		// Right arrow
		case 39:
			$this.closest( "ol" )
				.children( "li:gt(" + $this.closest( "li[id^=cal-]" ).index() + ")" )
				.children( "a" ).first().trigger( setFocusEvent );
			return false;

		// Escape
		case 27:
			$this.closest( "li[id^=cal-]" ).children( ".cal-evt" ).trigger( setFocusEvent );
			return false;
		}
	},

	mouseOnDay = function( dayEvents ) {
		dayEvents.dequeue()
			.removeClass( "wb-inv" )
			.addClass( evDetails );
	},

	mouseOutDay = function( dayEvents ) {
		dayEvents.delay( 100 ).queue(function() {
			$( this ).removeClass( evDetails )
				.addClass( "wb-inv" )
				.dequeue();
		});
	},

	focus = function( dayEvents ) {
		dayEvents.removeClass( "wb-inv" )
			.addClass( evDetails );
	},

	blur = function( dayEvents ) {
		setTimeout(function() {
			var $elm = dayEvents;

			if ( $elm.find( "a:focus" ).length === 0 ) {
				$elm.removeClass( evDetails )
					.addClass( "wb-inv" );
			}
		}, 5);
	},

	keyboardEvents = function( event ) {
		var eventType = event.type,
			dayEvents = event.data.details;

		switch ( eventType ) {
		case "keydown":
			keyboardNavEvents( event );
			break;

		case "blur":
			blur( dayEvents );
			break;

		case "focus":
			focus( dayEvents );
			break;
		}
	},

	mouseEvents = function( event ) {
		var eventType = event.type,
			dayEvents = event.data.details;

		switch ( eventType ) {
		case "mouseover":
			mouseOnDay( dayEvents );
			break;

		case "mouseout":
			mouseOutDay( dayEvents );
			break;
		}
	},

	addEvents = function( year, month, days, containerId, eventsList ) {
		var i, eLen, date, day, content, dayEvents, link, eventDetails, itemLink;

		// Fix required to make up with the IE z-index behavior mismatch
		days.each(function( index, day ) {
			$( day ).css( "z-index", 31 - index );
		});

		/*
		 * Determines for each event, if it occurs in the display month
		 * Modification - the author used a jQuery native $.each function for
		 * looping. This is a great function, but has a tendency to like
		 * HTMLELEMENTS and jQuery objects better. We have modified this
		 * to a for loop to ensure that all the elements are accounted for.
		 */
		for ( i = 0, eLen = eventsList.length; i !== eLen; i += 1 ) {
			date = new Date( eventsList[ i ].date );

			if ( date.getMonth() === month && date.getFullYear() === year ) {
				day = $( days[ date.getDate() - 1 ] );

				// Gets the day cell to display an event
				content = day.children( "div" ).html();

				// Lets see if the cell is empty is so lets create the cell
				if ( day.children( "a" ).length < 1 ) {
					day.empty();
					link = $( "<a href='#ev-" + day.attr( "id" ) + "' class='cal-evt'>" + content + "</a>" );
					day.append( link );
					dayEvents = $( "<ul class='wb-inv'></ul>" );

					link.on( "keydown blur focus", { details: dayEvents }, keyboardEvents );

					day.on( "mouseover mouseout", { details: dayEvents }, mouseEvents )
						.append( dayEvents );

				} else {
					/*
					 * Modification - added an else to the date find due to
					 * event collisions not being handled. So the pointer was
					 * getting lost.
					 */
					dayEvents = day.find( "ul.wb-inv" );
				}

				eventDetails = $( "<li><a tabindex='-1' href='" + eventsList[ i ].href + "'>" + eventsList[ i ].title + "</a></li>" );

				dayEvents.append( eventDetails );

				itemLink = eventDetails.children( "a" );

				itemLink.on( "keydown blur focus", { details: dayEvents }, keyboardEvents );
			}
		}
	},

	showOnlyEventsFor = function( year, month, calendarId ) {
		$( "." + calendarId + " li.cal-disp-onshow" )
			.addClass( "wb-inv" )
			.has( ":header[class*=filter-" + year + "-" +
				wb.string.pad( parseInt( month, 10 ) + 1, 2 ) + "]" )
			.removeClass( "wb-inv" );
	};

// Bind the init event of the plugin
$document.on( "timerpoke.wb " + initEvent, selector, function() {
	init( $( this ) );

	/*
	 * Since we are working with events we want to ensure that we are being passive about our control,
	 * so returning true allows for events to always continue
	 */
	return true;
});

// Add the timer poke to initialize the plugin
wb.add( selector );

})( jQuery, window, wb );
