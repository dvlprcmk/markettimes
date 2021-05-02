(async () => {
    /* Initialize */
    /* CONST */
    const SOURCE = await d3.json('./source.json');
    const COUNTRIES = await d3.json('./countries.json').then(data => data.data);
    const ALL_EXCHANGES = Object.entries(SOURCE).map(source => ({
        mic: source[0],
        exchangeName: source[1]['name'],
        country: COUNTRIES[source[1]['country']],
        city: source[1]['city'],
        utcOffset: moment.tz(source[1]['timezone']).format('Z'),
        yAxisLabel: `${source[0]} / ${source[1]['city']}`
    }));
    const TOP_10_EXCHANGES = ['XNYS', 'XNAS', 'XJPX', 'XLON', 'XSHG', 'XHKG', 'XPAR', 'XSHE', 'XTSE', 'XBOM'];
    const ALL_UTCOFFSET = moment.tz.names().map(d => ({ key: moment.tz(d).format('Z'), value: moment.tz(d).utcOffset() })).sort((a, b) => b.value - a.value);
    const LOCAL_UTCOFFSET = moment().utcOffset();
    const DAYS_WEEK = 7;
    const DAYS_BETWEEN = 14;
    const SUNRISE = 6, SUNSET = 18;
    const Y_OFFSET = 20;
    const SESSION_HEIGHT = 30;
    const SCROLLBAR_WIDTH = 20;
    const DEFAULT_ROLLING_HOUR = 14;

    const MOBILE_BREAKPOINT = 576;
    const MOBILE_TICKS = 3;

    /* Converter */
    var utcOffset = d3.scaleOrdinal()
        .domain(d3.map(ALL_UTCOFFSET, d => d.key).keys())
        .range(d3.map(ALL_UTCOFFSET, d => d.value).keys());

    var color = d3.scaleOrdinal()
        .domain(['auction', 'continuous', 'afterHours', 'market holiday'])
        .range(['#E7552C', '#344D90', '#5CC5EF', 'gray']);

    /* Preference */
    var chartInterface = localStorage.getItem('chartInterface') || 'static';
    var preferredExchanges = JSON.parse(localStorage.getItem('preferredExchanges')) || getData().map(d => d.yAxisLabel);

    /* Time */
    var utcOffsetKey = moment().format('Z'),
        utcOffsetValue = utcOffset(utcOffsetKey) - LOCAL_UTCOFFSET;
    var today = moment(),
        currTime = moment().add(utcOffsetValue, 'minutes');
    var startOfWeek = moment(currTime).startOf('week'),
        endOfWeek = moment(startOfWeek).add(DAYS_WEEK, 'days');
    var rollingHour = DEFAULT_ROLLING_HOUR;

    /* Data */
    var data = getData();
    console.log(data);

    /* Position */
    var margin = { top: 50, right: 0, bottom: 20, left: 150 };
    var width = document.querySelector('#demo').offsetWidth - margin.left - SCROLLBAR_WIDTH;
    height = data.length * SESSION_HEIGHT;

    /* xScale and xAxis */
    var ticksNum = width <= MOBILE_BREAKPOINT ? MOBILE_TICKS : null;
    var xScaleDate = d3.scaleTime()
        .range([0, width])
        .domain([startOfWeek, moment(startOfWeek).endOf('week')]);
    var xScale = d3.scaleTime()
        .range([0, width])
        .domain([startOfWeek, endOfWeek]);
    var xAxisDate = d3.axisTop(xScaleDate)
        .ticks(d3.timeDay)
        .tickFormat(d3.timeFormat('%a %d %b'))
        .tickSize(-height - Y_OFFSET)
        .tickSizeOuter(0);
    var xAxis = d3.axisTop(xScale)
        .ticks(ticksNum)
        .tickFormat(d3.timeFormat('%H:%M'))
        .tickSizeInner(3)
        .tickSizeOuter(0);

    /* yScale and yAxis */
    var yScale = d3.scaleBand()
        .range([0, height])
        .domain(data.map(d => d.yAxisLabel))
        .padding(0.2);
    var yAxis = d3.axisLeft(yScale)
        .tickSizeOuter(0);

    /* Graph */
    var svgY = d3.select('#demo')
        .append('svg')
        .attr('width', margin.left)
        .attr('height', height + margin.top + margin.bottom);

    var svg = d3.select('#demo')
        .append('svg')
        .attr('width', width)
        .attr('height', height + margin.top + margin.bottom);

    var gY = svgY.append('g')
        .attr('transform', `translate(${margin.left}, ${margin.top})`);

    var g = svg.append('g')
        .attr('transform', `translate(0, ${margin.top})`);

    var defs = g.append('defs');

    var bg = g.append('g')
        .classed('background', true);

    var ss = g.append('g')
        .classed('sessions', true);

    /* Zoom */
    var t, xtDate, xt, zoom = d3.zoom()
        .scaleExtent([1, 168])
        .translateExtent([[0, 0], [width * 2, 0]])
        .extent([[0, 0], [width, 0]])
        .on('zoom', () => {
            t = d3.event.transform, xtDate = t.rescaleX(xScaleDate), xt = t.rescaleX(xScale);
            ticksNum = t.k <= 3 && width <= MOBILE_BREAKPOINT ? DAYS_WEEK : t.k > 3 && width <= MOBILE_BREAKPOINT ? MOBILE_TICKS : null;

            if (chartInterface == 'static') {
                adjustXAxis();
                adjustBG();
                adjustSessions();
                staticMove();
            }
            else if (chartInterface == 'rolling') {
                if (d3.event.sourceEvent && d3.event.sourceEvent.type == 'wheel') {
                    rollingHour = 1 / d3.event.transform.k * 168;
                    rollingMove();
                    document.querySelector('input[name=rollingHour]').value = rollingHour.toFixed(1);
                }
                else if (d3.event.sourceEvent && (d3.event.sourceEvent.type == 'mousemove' || d3.event.sourceEvent.type == 'touchmove')) {
                    chartInterface = 'static';
                    d3.select('input[type=radio][name=chartInterface][value=static]')
                        .property('checked', true);
                }
                else {
                    adjustXAxis();
                    adjustBG();
                    adjustSessions();
                }
            }
        });

    /* Drag */
    var originalPosition, drag = d3.drag()
        .on('start', () => {
            d3.event.sourceEvent.target.parentElement.classList.add('grabbing');
            originalPosition = data.map(d => d.yAxisLabel);
        }).on('drag', (d, i, l) => {
            l[i].setAttribute('transform', `translate(0, ${d3.event.y})`);
            preferredExchanges = Array.from(l)
                .sort((a, b) => a.transform.baseVal[0].matrix.f - b.transform.baseVal[0].matrix.f)
                .map((d => d.__data__));

            if (JSON.stringify(originalPosition) != JSON.stringify(preferredExchanges)) {
                /* Data */
                data.sort((a, b) => preferredExchanges.indexOf(a.yAxisLabel) - preferredExchanges.indexOf(b.yAxisLabel));

                /* yScale and yAxis */
                yScale = d3.scaleBand()
                    .range([0, height])
                    .domain(data.map(d => d.yAxisLabel))
                    .padding(0.2);
                yAxis = d3.axisLeft(yScale)
                    .tickSizeInner(3)
                    .tickSizeOuter(0);

                gY.select('.y-axis')
                    .call(yAxis);

                /* Session */
                data.forEach(exchange => {
                    ss.selectAll(`.${exchange.city.replace(/ /g, '-')} .session, .${exchange.city.replace(/ /g, '-')} .g-session`)
                        .transition()
                        .attr('y', yScale(exchange.yAxisLabel));
                });

                originalPosition = data.map(d => d.yAxisLabel);
            }
        }).on('end', () => {
            d3.event.sourceEvent.target.parentElement.classList.remove('grabbing');
            gY.select('.y-axis')
                .call(yAxis);
            localStorage.setItem('preferredExchanges', JSON.stringify(preferredExchanges));
        });

    /* UX */
    d3.select('.current-time-display')
        .text(currTime.format('YYYY-MM-DD HH:mm:ss'));

    d3.select('.reset-btn')
        .on('click', () => {
            chartInterface == 'static' ? zoomTo(currTime, true) :
                (rollingHour = DEFAULT_ROLLING_HOUR, document.querySelector('input[name=rollingHour]').value = rollingHour);
        });

    d3.select('select[name=utcOffset]')
        .on('change', () => {
            utcOffsetValue = d3.event.target.value - LOCAL_UTCOFFSET;
            refresh();
        }).selectAll()
        .data(d3.map(ALL_UTCOFFSET, d => d.key).keys())
        .enter()
        .append('option')
        .attr('value', d => utcOffset(d))
        .property('selected', d => d == utcOffsetKey)
        .text(d => `UTC${d}`);

    d3.select(`input[type=radio][name=chartInterface][value=${chartInterface}]`)
        .property('checked', true);
    d3.selectAll('input[type=radio][name=chartInterface]')
        .on('change', () => {
            chartInterface = d3.event.target.value;
            chartInterface == 'static' ? zoomTo(currTime, true) : rollingMove(true);
            localStorage.setItem('chartInterface', chartInterface);
        });

    d3.select('input[type=number][name=rollingHour]')
        .attr('value', DEFAULT_ROLLING_HOUR)
        .on('input', () => {
            rollingHour = d3.event.target.value ? parseInt(d3.event.target.value) : rollingHour;
            rollingHour = rollingHour < 1 ? 1 : rollingHour > 168 ? 168 : rollingHour;
        });

    d3.select('input[type=text][name=queryString]')
        .on('keyup', () => {
            var queryString = d3.event.target.value.toUpperCase();
            var filtered = ALL_EXCHANGES.filter(d => d.mic.toUpperCase().includes(queryString) ||
                d.exchangeName.toUpperCase().includes(queryString) ||
                d.country.toUpperCase().includes(queryString) ||
                d.city.toUpperCase().includes(queryString));

            d3.selectAll('.row .col')
                .style('display', 'none');

            filtered.map(d => d.mic).forEach(d => {
                d3.select(`#${d}`)
                    .style('display', 'block');
            });
        });

    d3.select('.row')
        .selectAll()
        .data(ALL_EXCHANGES)
        .enter()
        .append('div')
        .classed('col', true)
        .attr('id', d => d.mic);
    d3.selectAll('.row .col')
        .append('input')
        .attr('type', 'checkbox')
        .attr('name', 'preferredExchanges')
        .attr('value', d => d.yAxisLabel)
        .property('checked', d => preferredExchanges.some(exchange => d.yAxisLabel == exchange))
        .on('change', () => {
            preferredExchanges = d3.selectAll('input[type=checkbox][name=preferredExchanges]:checked')
                .nodes()
                .map(d => d.value)
                .sort((a, b) => preferredExchanges.indexOf(a) - preferredExchanges.indexOf(b));
            data = getData();

            redraw();
            zoomTo(currTime);

            data.forEach(exchange => {
                ss.selectAll(`.${exchange.city.replace(/ /g, '-')} .session, .${exchange.city.replace(/ /g, '-')} .g-session`)
                    .transition()
                    .attr('y', yScale(exchange.yAxisLabel));
            });

            localStorage.setItem('preferredExchanges', JSON.stringify(preferredExchanges));
        });
    d3.selectAll('.row .col')
        .append('span')
        .text(d => d.yAxisLabel);

    d3.select('.reset-default-btn').on('click', () => {
        preferredExchanges = ALL_EXCHANGES.filter(d => TOP_10_EXCHANGES.includes(d.mic))
            .sort((a, b) => utcOffset(b.utcOffset) - utcOffset(a.utcOffset))
            .map(d => d.yAxisLabel);
        data = getData();

        redraw();
        chartInterface == 'static' && zoomTo(currTime, true);

        data.forEach(exchange => {
            ss.selectAll(`.${exchange.city.replace(/ /g, '-')} .session, .${exchange.city.replace(/ /g, '-')} .g-session`)
                .transition()
                .attr('y', yScale(exchange.yAxisLabel));
        });

        rollingHour = DEFAULT_ROLLING_HOUR;

        d3.selectAll('input[name=preferredExchanges]')
            .property('checked', d => TOP_10_EXCHANGES.some(exchange => d.mic == exchange));
        document.querySelector('input[name=rollingHour]').value = rollingHour;

        localStorage.setItem('preferredExchanges', JSON.stringify(preferredExchanges));
    });

    /* Draw */
    /* Graph */
    defs.append('linearGradient')
        .attr('id', 'beforeSunrise');
    defs.select('#beforeSunrise')
        .append('stop')
        .attr('offset', '10%')
        .attr('style', 'stop-color: lightgray; stop-opacity: 0.75;');
    defs.select('#beforeSunrise')
        .append('stop')
        .attr('offset', '90%')
        .attr('style', 'stop-color: lightgray; stop-opacity: 0.2;');
    defs.append('linearGradient')
        .attr('id', 'afterSunset');
    defs.select('#afterSunset')
        .append('stop')
        .attr('offset', '10%')
        .attr('style', 'stop-color: lightgray; stop-opacity: 0.2;');
    defs.select('#afterSunset')
        .append('stop')
        .attr('offset', '90%')
        .attr('style', 'stop-color: lightgray; stop-opacity: 0.75;');

    drawBg();
    drawSessions();

    g.append('g')
        .classed('x-axis-date', true)
        .attr('transform', `translate(0, ${-Y_OFFSET})`)
        .call(xAxisDate);

    g.append('g')
        .classed('x-axis', true)
        .call(xAxis);

    gY.append('g')
        .classed('y-axis', true)
        .call(yAxis);

    gY.selectAll('.y-axis g')
        .on('mousemove', d => {
            var detail = data.find(data => data.yAxisLabel == d);
            d3.select('.tooltip').style('display', 'block')
                .style('top', `${d3.event.clientY - 100}px`)
                .style('left', `${d3.event.clientX + 10}px`)
                .html(() => `
                <div>MIC: ${detail.mic}</div>
                <div>Exchange Name: ${detail.exchangeName}</div>
                <div>Country: ${detail.country}</div>
                <div>Timezone: ${detail.timezone}</div>
                `);
        }).on('mouseout', () => {
            d3.select('.tooltip')
                .style('display', 'none');
        }).call(drag)
        .append('text')
        .classed('exchange-time', true)
        .attr('x', '-9')
        .attr('dy', '1.5em');

    g.append('g')
        .classed('current-time-indicator', true)
        .append('line')
        .attr('x1', xScale(currTime))
        .attr('y1', -Y_OFFSET)
        .attr('x2', xScale(currTime))
        .attr('y2', height)
        .attr('fill', 'none')
        .attr('stroke', 'black')
        .attr('stroke-dasharray', '1');

    g.append('g')
        .classed('g-current-time-indicator', true)
        .append('rect')
        .attr('x', -Y_OFFSET)
        .attr('y', -Y_OFFSET)
        .attr('width', Math.max(0, xScale(currTime) + Y_OFFSET))
        .attr('height', Y_OFFSET)
        .attr('fill', 'white')
        .attr('fill-opacity', '0.65');

    svg.call(zoom);
    // currTime = moment(20200923, 'YYYYMMDD'); // dummy
    chartInterface == 'static' ? zoomTo(currTime, true) : rollingMove(true);

    /* Main */
    setInterval(() => {
        currTime = moment().add(utcOffsetValue, 'minutes');
        // currTime = moment(currTime).add(360, 'minutes'); // dummy
        d3.select('.current-time-display')
            .text(currTime.format('YYYY-MM-DD HH:mm:ss'));

        currTime.format('D') != today.format('D') && refresh();
        chartInterface == 'static' && staticMove();
        chartInterface == 'rolling' && rollingMove(true);

        adjustYAxis();
    }, 1000);

    /* Responsive */
    window.addEventListener('resize', () => {
        width = document.querySelector('#demo').offsetWidth - margin.left - SCROLLBAR_WIDTH;
        ticksNum = width <= MOBILE_BREAKPOINT ? ticksNum : null;
        xScaleDate = xScaleDate.range([0, width]);
        xScale = xScale.range([0, width]);
        svg.attr('width', width);
        zoom = zoom.translateExtent([[0, 0], [width * 2, 0]])
            .extent([[0, 0], [width, 0]]);
        svg.call(zoom.transform, d3.zoomIdentity
            .scale(t.k)
            .translate(-xScale(xt.domain()[0]), 0));
    });

    function refresh() {
        console.log('refresh...');
        /* Time */
        today = currTime;
        startOfWeek = moment(currTime).startOf('week');
        endOfWeek = moment(startOfWeek).add(DAYS_WEEK, 'days');

        /* Data */
        data = getData();
        console.log(data);

        /* xScale and xAxis */
        xScaleDate.domain([startOfWeek, moment(startOfWeek).endOf('week')]);
        g.select('.x-axis-date')
            .call(xAxisDate);
        xScale.domain([startOfWeek, endOfWeek]);
        g.select('.x-axis')
            .call(xAxis);

        redraw();
        zoomTo(currTime, true);
    }

    function staticMove() {
        g.select('.current-time-indicator line')
            .attr('x1', xt(currTime))
            .attr('x2', xt(currTime))
            .attr('opacity', xt(currTime) <= 0 || xt(currTime) >= width ? 0 : 1);

        g.select('.g-current-time-indicator rect')
            .attr('width', Math.max(0, xt(currTime) + Y_OFFSET));

        g.selectAll('.g-session')
            .attr('x', d => Math.max(0, xt(d.timeStart)))
            .attr('width', d => xt(currTime) >= xt(d.timeEnd) ?
                adjustWidth(xt(d.timeStart), xt(d.timeEnd)) : adjustWidth(xt(d.timeStart), xt(currTime)));
    }

    function rollingMove(transition = false) {
        var start = moment(currTime).startOf('day').add(0, 'hours'),
            end = moment(currTime).startOf('day').add(rollingHour, 'hours');
        var movement = moment(currTime).add(-1, 'hours');

        g.select('.current-time-indicator line')
            .attr('x1', width * (1 / rollingHour))
            .attr('x2', width * (1 / rollingHour))
            .attr('opacity', '1');

        g.select('.g-current-time-indicator rect')
            .attr('width', Math.max(0, width * (1 / rollingHour) + Y_OFFSET));

        !transition ?
            svg.call(zoom.transform, d3.zoomIdentity
                .scale(width / (xScale(end) - xScale(start)))
                .translate(-xScale(movement), 0)) :
            svg.transition()
                .call(zoom.transform, d3.zoomIdentity
                    .scale(width / (xScale(end) - xScale(start)))
                    .translate(-xScale(movement), 0));
    }

    function redraw() {
        bg.selectAll('rect').remove();
        ss.selectAll('.session, .g-session').remove();
        gY.selectAll('.y-axis g').remove();
        g.select('.current-time-indicator').remove();

        /* height */
        height = data.length * SESSION_HEIGHT;

        drawBg();
        drawSessions();

        /* yScale and yAxis */
        yScale = d3.scaleBand()
            .range([0, height])
            .domain(data.map(d => d.yAxisLabel))
            .padding(0.2);
        yAxis = d3.axisLeft(yScale)
            .tickSizeInner(3)
            .tickSizeOuter(0);

        svgY.attr('height', height + margin.top + margin.bottom);
        svg.attr('height', height + margin.top + margin.bottom);

        g.select('.x-axis-date')
            .call(xAxisDate.tickSizeInner(-height - Y_OFFSET));

        gY.select('.y-axis')
            .call(yAxis);

        gY.selectAll('.y-axis g')
            .on('mousemove', d => {
                var detail = data.find(data => data.yAxisLabel == d);
                d3.select('.tooltip').style('display', 'block')
                    .style('top', `${d3.event.clientY - 100}px`)
                    .style('left', `${d3.event.clientX + 10}px`)
                    .html(() => `
                <div>MIC: ${detail.mic}</div>
                <div>Exchange Name: ${detail.exchangeName}</div>
                <div>Country: ${detail.country}</div>
                <div>Timezone: ${detail.timezone}</div>
                `);
            }).on('mouseout', () => {
                d3.select('.tooltip')
                    .style('display', 'none');
            }).call(drag)
            .append('text')
            .classed('exchange-time', true)
            .attr('x', '-9')
            .attr('dy', '1.5em');

        g.append('g')
            .classed('current-time-indicator', true)
            .append('line')
            .attr('x1', xScale(currTime))
            .attr('y1', -Y_OFFSET)
            .attr('x2', xScale(currTime))
            .attr('y2', height)
            .attr('fill', 'none')
            .attr('stroke', 'black')
            .attr('stroke-dasharray', '1');
    }

    function drawBg() {
        var dates = [...Array(DAYS_BETWEEN + 1)].map((d, i) => moment(startOfWeek).add(i, 'days'));

        bg.selectAll()
            .data(dates)
            .enter()
            .append('rect')
            .classed('beforeSunrise', true)
            .attr('x', d => xScale(moment(d)))
            .attr('width', d => xScale(moment(d).set({ hour: SUNRISE })) - xScale(moment(d)))
            .attr('fill', 'url(#beforeSunrise)');
        bg.selectAll()
            .data(dates)
            .enter()
            .append('rect')
            .classed('afterSunset', true)
            .attr('x', d => xScale(moment(d).set({ hour: SUNSET })))
            .attr('width', d => xScale(moment(d).set({ hour: 24 })) - xScale(moment(d).set({ hour: SUNSET })))
            .attr('fill', 'url(#afterSunset)');
        bg.selectAll('rect')
            .attr('y', -Y_OFFSET)
            .attr('height', height + Y_OFFSET);
    }

    function drawSessions() {
        /* Sessions */
        data.forEach(exchange => {
            var s = ss.append('g')
                .classed(exchange.city.replace(/ /g, '-'), true)
                .selectAll()
                .data(exchange.sessions)
                .enter();
            /* Session */
            s.append('rect')
                .classed('session', true)
                .attr('id', d => d.id)
                .attr('width', d => Math.max(0, xScale(d.timeEnd) - xScale(d.timeStart)))
                .attr('fill', d => color(d.type))
                .attr('fill-opacity', '0.85');
            /* Ghost Session */
            s.append('rect')
                .classed('g-session', true)
                .attr('id', d => d.id)
                .attr('width', d => xScale(currTime) >= xScale(d.timeEnd) ?
                    Math.max(0, xScale(d.timeEnd) - xScale(d.timeStart)) : Math.max(0, xScale(currTime) - xScale(d.timeStart)))
                .attr('fill', 'white')
                .attr('fill-opacity', '0.65');

            ss.selectAll(`.${exchange.city.replace(/ /g, '-')} .session, .${exchange.city.replace(/ /g, '-')} .g-session`)
                .attr('x', d => xScale(d.timeStart))
                .attr('y', yScale(exchange.yAxisLabel))
                .attr('height', yScale.bandwidth())
                .on('mousemove', d => {
                    const MINIMUN_WIDTH = 250;
                    var scale = 1.5;
                    var target = ss.select(`#${d3.event.target.id}.session`);
                    var ta = { y: parseFloat(target.attr('y')), height: parseFloat(target.attr('height')) };
                    var m = { sy: scale, cy: ta.y + ta.height / 2 };
                    var gTarget = ss.select(`#${d3.event.target.id}.g-session`);
                    var sessionsNum = exchange.sessions.filter(session => session.date == d.date).length;
                    var tooltipWidth = width > MOBILE_BREAKPOINT ? Math.max(MINIMUN_WIDTH, sessionsNum * 125) : MINIMUN_WIDTH;

                    d3.select('.tooltip').style('display', 'block')
                        .style('top', `${Math.max(0, d3.event.clientY - 100)}px`)
                        .style('left', `${d3.event.clientX > (width + margin.left + SCROLLBAR_WIDTH) / 2 ?
                            Math.max(0, d3.event.clientX - tooltipWidth - 15) : d3.event.clientX + 15}px`)
                        .html(() => {
                            var str1 = '', str2 = '';
                            exchange.sessions.filter(session => session.date == d.date)
                                .forEach(session => {
                                    if (session.id == d.id) {
                                        str1 += `<b>${session.timeStart.format('HH:mm')} - ${session.timeEnd.format('HH:mm')} </b>`;
                                        str2 += `<b>${moment(session.timeStart).tz(exchange.timezone).add(-utcOffsetValue, 'minutes').format('HH:mm')} - ` +
                                            `${moment(session.timeEnd).tz(exchange.timezone).add(-utcOffsetValue, 'minutes').format('HH:mm')} </b>`;
                                    }
                                    else if (width > MOBILE_BREAKPOINT) {
                                        str1 += `${session.timeStart.format('HH:mm')} - ${session.timeEnd.format('HH:mm')} `;
                                        str2 += `${moment(session.timeStart).tz(exchange.timezone).add(-utcOffsetValue, 'minutes').format('HH:mm')} - ` +
                                            `${moment(session.timeEnd).tz(exchange.timezone).add(-utcOffsetValue, 'minutes').format('HH:mm')} `;
                                    }
                                });
                            return `<table><tbody>
                                    <tr><td>Session</td><td><b>${d.type}</b></td></tr>
                                    <tr><td>Local Time</td><td>${str1}</td></tr>
                                    <tr><td>${exchange.city} Time</td><td>${str2}</td></tr>
                                    </tbody></table>`;
                        });
                    target.attr('fill-opacity', '1')
                        .attr('filter', 'drop-shadow(10px 10px 3px black)')
                        .attr('transform', `matrix(1, 0, 0, ${m.sy}, 0, ${m.cy - m.sy * m.cy})`)
                        .raise();
                    gTarget.attr('transform', `matrix(1, 0, 0, ${m.sy}, 0, ${m.cy - m.sy * m.cy})`)
                        .raise();
                }).on('mouseout', () => {
                    d3.select('.tooltip')
                        .style('display', 'none');

                    ss.selectAll(`.session`)
                        .attr('fill-opacity', '0.85')
                        .attr('filter', null)
                        .attr('transform', null);
                    ss.selectAll(`.g-session`)
                        .attr('transform', null);
                    ss.select(`#${d3.event.target.id}.session`)
                        .lower();
                });
        });
    }

    function adjustXAxis() {
        g.select('.x-axis-date')
            .call(xAxisDate.scale(xtDate)
                .tickFormat(d => width <= MOBILE_BREAKPOINT ? d3.timeFormat('%d %b')(d) : d3.timeFormat('%a %d %b')(d)));
        g.selectAll('.x-axis-date .tick text')
            .attr('text-anchor', 'start');
        g.select('.x-axis')
            .call(xAxis.scale(xt).ticks(ticksNum));
    }

    function adjustYAxis() {
        gY.selectAll('.y-axis g text')
            .attr('fill', d => isOpen(d) ? 'green' : 'red');
        gY.selectAll('.exchange-time')
            .text(d => `${getExchangeTime(d)} ${data.find(data => data.yAxisLabel == d).utcOffset}`);
    }

    function adjustBG() {
        bg.selectAll('.beforeSunrise')
            .attr('x', d => Math.max(0, xt(moment(d))))
            .attr('width', d => adjustWidth(xt(moment(d)), xt(moment(d).set({ hour: SUNRISE }))));
        bg.selectAll('.afterSunset')
            .attr('x', d => Math.max(0, xt(moment(d).set({ hour: SUNSET }))))
            .attr('width', d => adjustWidth(xt(moment(d).set({ hour: SUNSET })), xt(moment(d).set({ hour: 24 }))));
    }

    function adjustSessions() {
        g.selectAll('.session')
            .attr('x', d => Math.max(0, xt(d.timeStart)))
            .attr('width', d => adjustWidth(xt(d.timeStart), xt(d.timeEnd)));

        g.selectAll('.g-session')
            .attr('x', d => Math.max(0, xt(d.timeStart)))
            .attr('width', d => xt(currTime) >= xt(d.timeEnd) ?
                adjustWidth(xt(d.timeStart), xt(d.timeEnd)) : adjustWidth(xt(d.timeStart), xt(currTime)));
    }

    function adjustWidth(head, tail) {
        return Math.max(0, head < 0 && tail > width ? width : head < 0 ? tail : tail > width ? width - head : tail - head);
    }

    function getData() {
        return Object.entries(SOURCE).map(source => ({
            mic: source[0],
            exchangeName: source[1]['name'],
            sessions: getSessions(utcOffset(moment.tz(source[1]['timezone']).format('Z')) - LOCAL_UTCOFFSET - utcOffsetValue,
                source[1]['specialDays'], source[1]['dayOfWeek'], source[1]['definitions'])
                .map((d, i) => Object.assign(d, { id: `${source[0]}-${i}` })),
            country: COUNTRIES[source[1]['country']],
            city: source[1]['city'],
            timezone: source[1]['timezone'],
            utcOffset: moment.tz(source[1]['timezone']).format('Z'),
            yAxisLabel: `${source[0]} / ${source[1]['city']}`
        })).filter(d => preferredExchanges ? preferredExchanges.includes(d.yAxisLabel) : TOP_10_EXCHANGES.includes(d.mic))
            .sort((a, b) => preferredExchanges ? preferredExchanges.indexOf(a.yAxisLabel) - preferredExchanges.indexOf(b.yAxisLabel) :
                utcOffset(b.utcOffset) - utcOffset(a.utcOffset))
            .filter((d, i) => preferredExchanges ? true : i < 10);

        function getSessions(utcOffsetValue, specialDays, dayOfWeek, definitions) {
            return [...Array(DAYS_BETWEEN + 1)].map((d, i) => moment(startOfWeek).add(i, 'days'))
                .map(d => {
                    var YYYYMMDDFormat = d.format('YYYYMMDD');
                    var dFormat = d.day();

                    if (specialDays['_none'] && specialDays['_none'].some(d => d == YYYYMMDDFormat))
                        return mapDateToDefinition(utcOffsetValue, YYYYMMDDFormat, definitions['D'], true);
                    else if (specialDays['D-half'] && specialDays['D-half'].some(d => d == YYYYMMDDFormat))
                        return mapDateToDefinition(utcOffsetValue, YYYYMMDDFormat, definitions['D-half']);
                    else if (specialDays['D'] && specialDays['D'].some(d => d == YYYYMMDDFormat))
                        return mapDateToDefinition(utcOffsetValue, YYYYMMDDFormat, definitions['D']);
                    else if (dayOfWeek[dFormat] == 'D')
                        return mapDateToDefinition(utcOffsetValue, YYYYMMDDFormat, definitions['D']);
                }).filter(d => d).flat();

            function mapDateToDefinition(utcOffsetValue, date, definition, holiday = false) {
                var definitions = Object.values(definition);
                if (holiday) {
                    var timeStartAndEnd = d3.extent(definitions.flatMap(d => [d.timeStart, d.timeEnd]));
                    return {
                        type: 'market holiday',
                        timeStart: moment(`${date} ${timeStartAndEnd[0]}`, 'YYYYMMDD HH:mm:ss').add(-utcOffsetValue, 'minutes'),
                        timeEnd: moment(`${date} ${timeStartAndEnd[1]}`, 'YYYYMMDD HH:mm:ss').add(-utcOffsetValue, 'minutes'),
                    };
                }
                else
                    return definitions.map(d => ({
                        type: d.type,
                        date: date,
                        timeStart: moment(`${date} ${d.timeStart}`, 'YYYYMMDD HH:mm:ss').add(-utcOffsetValue, 'minutes'),
                        timeEnd: moment(`${date} ${d.timeEnd}`, 'YYYYMMDD HH:mm:ss').add(-utcOffsetValue, 'minutes'),
                        matchStart: d.matchStart ? moment(`${date} ${d.matchStart}`, 'YYYYMMDD HH:mm:ss').add(-utcOffsetValue, 'minutes') : null,
                        matchEnd: d.matchEnd ? moment(`${date} ${d.matchEnd}`, 'YYYYMMDD HH:mm:ss').add(-utcOffsetValue, 'minutes') : null,
                        notes: d.notes ? d.notes : null
                    }));
            }
        }
    }

    function getExchangeTime(yAxisLabel) {
        return moment(currTime).tz(data.find(d => d.yAxisLabel == yAxisLabel).timezone).add(-utcOffsetValue, 'minutes').format('YYYY-MM-DD HH:mm:ss');
    }

    function isOpen(yAxisLabel) {
        var exchangeOpenAndClose = data.find(d => d.yAxisLabel == yAxisLabel).sessions
            .filter(d => d.type == 'market holiday' ? false : d.timeStart.format('YYYYMMDD') == today.format('YYYYMMDD') ||
                d.timeEnd.format('YYYYMMDD') == today.format('YYYYMMDD'))
            .map(d => [d.timeStart, d.timeEnd]);

        return exchangeOpenAndClose.some(d => currTime.isBetween(d[0], d[1], null, '[]'));
    }

    function zoomTo(thisDate, reset = false) {
        var start = xt && !reset ? xt.domain()[0] : moment(thisDate).startOf('day').add(0, 'hours'),
            end = xt && !reset ? xt.domain()[1] : moment(thisDate).startOf('day').add(24, 'hours');

        svg.transition()
            .call(zoom.transform, d3.zoomIdentity
                .scale(width / (xScale(end) - xScale(start)))
                .translate(-xScale(start), 0));
    }
})();

/* CONTROL PANEL */
var open = false;
function toggleControl(forceClose = false) {
    open = !open;
    if (open && !forceClose)
        document.querySelector('.control-panel').style.width = '50%';
    else
        document.querySelector('.control-panel').style.width = '0%';
}