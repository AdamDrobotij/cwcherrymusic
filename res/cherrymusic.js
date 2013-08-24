//
// CherryMusic - a standalone music server
// Copyright (c) 2012 Tom Wallroth & Tilman Boerner
//
// Project page:
//   http://fomori.org/cherrymusic/
// Sources on github:
//   http://github.com/devsnd/cherrymusic/
//
// licensed under GNU GPL version 3 (or later)
//
// CherryMusic is based on
//   jPlayer (GPL/MIT license) http://www.jplayer.org/
//   CherryPy (BSD license) http://www.cherrypy.org/
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>
//

var browser = detectBrowser();
//see http://www.w3schools.com/html/html5_audio.asp for available formats per browser
if(['msie','safari'].indexOf(browser) != -1){
    var encoderPreferenceOrder = ['mp3','ogg'];
} else {
    var encoderPreferenceOrder = ['ogg','mp3'];
}

var SERVER_CONFIG = {};
var availableEncoders = undefined;
var availablejPlayerFormats = ['mp3','ogg'];
var availableDecoders = undefined;
var transcodingEnabled = undefined;
var userOptions = undefined;
var isAdmin = undefined;
var loggedInUserName = undefined;
var REMEMBER_PLAYLIST_INTERVAL = 3000;
var HEARTBEAT_INTERVAL_MS = 30*1000;

var playlistSelector = '.jp-playlist';

var executeAfterConfigLoaded = []


/**
 * This function can call the cherrymusic api (v1)
 * api(String actionname,   -> action name as defined in httphandler.py
 *     [data,]              -> simple js object containing the data
 *     successfunc,         -> fucntion to be called on success
 *     errorfunc,           -> function to be called on error
 *     completefunc)        -> function to be called after error/success
 */
function api(){
    "use strict";
    var action = arguments[0];
    var has_data = !(typeof arguments[1] === 'function');
    var data = {};
    if(has_data){
        data = arguments[1];
    }
    var successfunc = arguments[has_data?2:1];
    var errorfunc = arguments[has_data?3:2];
    var completefunc = arguments[has_data?4:3];
    
    if(!successfunc) successfunc = function(){};
    if(!completefunc) completefunc = function(){};
    
    var successFuncWrapper = function(successFunc){
        return function handler(json){
            var result = $.parseJSON(json);
            if(result.flash){
                successNotify(result.flash);
            }
            successFunc(result.data);
        }
    }
    
    //wrapper for all error handlers:
    var errorFuncWrapper = function(errorFunc){
        return function(httpstatus){
            if(httpstatus.status == 401){
                /* if a request get's a 401, that means the user was logged
                 * out, so we reload to show the login page. */
                reloadPage();
            }
            errorFunc();
        }
    }
    if(!errorfunc){
        //default error handler
        errorfunc = function(){
            errorFunc('Error calling API function "'+action+'"')();
        };
    }
    $.ajax({
        url: 'api/'+action,
        context: $(this),
        type: 'POST',
        data: {'data': JSON.stringify(data)},
        success: successFuncWrapper(successfunc),
        error: errorFuncWrapper(errorfunc),
        complete: completefunc,
    });
}

htmlencode = function(val){
    return $('<div />').text(val?val:'').html();
}
htmldecode = function(val){
    return $('<div />').html(val?val:'').text();
}

function errorFunc(msg){
    "use strict";
    return function(){
        window.console.error('CMError: '+msg);
        displayNotification(msg,'error');
    };
}
function successNotify(msg){
    return function(){
        displayNotification(msg,'success');
    };
}

function displayNotification(msg,type){
    templateLoader.render(
        'flash-message', 
        {
            msg : msg,
            cssclass: type=='error'?'alert-error':type=='success'?'alert-success':''
        },
        $('#errormessage')
    );
}

/*******************
CONFIGURATION LOADER
*******************/
function loadConfig(executeAfter){
    "use strict";
    var success = function(data){
        var dictatedClientConfig = data;
        /** DEPRECATED GLOBAL VARIABLES **/
        availableEncoders = dictatedClientConfig.getencoders;
        availableDecoders = dictatedClientConfig.getdecoders;
        transcodingEnabled = dictatedClientConfig.transcodingenabled;
        isAdmin = dictatedClientConfig.isadmin;
        loggedInUserName = dictatedClientConfig.username;
        
        /** USE SERVER CONFIG INSTEAD **/
        SERVER_CONFIG = {
            'available_encoders': dictatedClientConfig.getencoders,
            'available_decoders': dictatedClientConfig.getdecoders,
            'transcoding_enabled': dictatedClientConfig.transcodingenabled,
            'is_admin': dictatedClientConfig.isadmin,
            'user_name': dictatedClientConfig.username,
            'serve_path': dictatedClientConfig.servepath,
            'transcode_path': dictatedClientConfig.transcodepath,
        }
        
        executeAfter();
        if(isAdmin){
            $('a[href="#adminpanel"]').show();
        }
    };
    var error = errorFunc("Could not fetch client configuration, CherryMusic will not work. Clearing the browser cache might help.");
    api('getconfiguration', {}, success, error);
}

/************
 * USER OPTIONS
 * **********/

function loadUserOptions(onSuccess){
    var success = function(userOptionsLoaded){
        userOptions = userOptionsLoaded;
        if(typeof onSuccess !== 'undefined'){
            onSuccess();
        }
        $('#custom_theme-primary_color').val(userOptions.custom_theme.primary_color);
        $('#custom_theme-white_on_black').attr('checked',userOptions.custom_theme.white_on_black);

        $('#keyboard_shortcuts-next').html(String.fromCharCode(userOptions.keyboard_shortcuts.next));
        $('#keyboard_shortcuts-prev').html(String.fromCharCode(userOptions.keyboard_shortcuts.prev));
        $('#keyboard_shortcuts-stop').html(String.fromCharCode(userOptions.keyboard_shortcuts.stop));
        $('#keyboard_shortcuts-play').html(String.fromCharCode(userOptions.keyboard_shortcuts.play));
        $('#keyboard_shortcuts-pause').html(String.fromCharCode(userOptions.keyboard_shortcuts.pause));
        $('#keyboard_shortcuts-search').html(String.fromCharCode(userOptions.keyboard_shortcuts.search));
        
        $('#misc-show_playlist_download_buttons').attr('checked',userOptions.misc.show_playlist_download_buttons);
        $('#misc-autoplay_on_add').attr('checked',userOptions.misc.autoplay_on_add);
    }
    api('getuseroptions', success);
}

var optionSetter = function(name, val, success, error){
    busy('#userOptions .content').hide().fadeIn();
    api('setuseroption',
        {
            'optionkey':name,
            'optionval':val
        },
        function(){ success(); loadUserOptions(); },
        error,
        function(){ busy('#userOptions .content').fadeOut('fast'); }
    )
}
keyboard_shortcut_setter = function(option, optionname){
    $('#shortcut-changer span').html('Hit any key to set shortcut for<br><b><i>'+optionname+'</i></b><br><br>Press <b>escape</b> or <b>space</b> to cancel.');
    $('#shortcut-changer').fadeIn('fast');
    $('#shortcut-changer input').val('');
    $('#shortcut-changer input').focus();
    var keydownhandler = function(e){
        if (e.altKey) return;
        if (e.shiftKey) return;
        if (e.ctrlKey) return;
        if (e.metaKey) return;
        var keyboardsetterend = function(){
            $('#shortcut-changer input').unbind('keyup',keydownhandler);
            $('html').unbind('keyup',keydownhandler);
            $('#shortcut-changer').fadeOut('fast');
        }
        if(e.which !== 27 && e.which !== 32){ //do not bind escape / space
            optionSetter(option,e.which,keyboardsetterend,keyboardsetterend);
        }
        keyboardsetterend();
    }
    $('#shortcut-changer input').bind('keyup',keydownhandler);
    $('html').bind('keyup',keydownhandler);
}

function busy(selector){
    "use strict";
    var domelem = $(selector).children('.busy-indicator');
    if(domelem.length == 0){
        domelem = $('<div></div>');
        domelem.addClass('busy-indicator');
        $(selector).append(domelem);
    }
    var pos = $(selector).position();
    var top = 'top: '+pos.top+'px;';
    var left = 'left: '+pos.left+'px;';
    var width = 'width: '+$(selector).width()+'px;';
    var height = 'height: '+$(selector).height()+'px;';
    domelem.attr('style','position: absolute;'+top+left+width+height);   
    return domelem;
}

function search(append){
    "use strict";
    if($('#searchfield input').val().trim() == ""){
        //make sure no spaces, so placeholder is shown
        $('#searchfield input').val('');
        $('#searchfield input').prop('placeholder', 'Search for what?')
        $('#searchfield input').focus();
        return false;
    }
    var searchstring = $('#searchfield input').val();
    var success = function(json){
        new MediaBrowser('.search-results', json, 'Search: '+htmlencode(searchstring));
        busy('#searchform').fadeOut('fast');
    };
    var error = function(){
        errorFunc('failed loading search results')();
        busy('#searchform').fadeOut('fast');
    };
    busy('#searchform').hide().fadeIn('fast');
    api('search', {'searchstring': searchstring}, success, error);
    return false;
}
function submitsearch(){
    search();
    return false;
}
    
/***
INTERACTION
***/

function showAlbumArtChangePopOver(jqobj){
    jqobj.popover({selector: jqobj.siblings('img'), title: 'Change cover art', html: true, content: '<img src="/res/img/folder.png" /><img src="/res/img/folder.png" /><img src="/res/img/folder.png" />'});
}


/* PLAYLIST CREATION AND MANAGEMENT END*/

ext2jPlayerFormat = function(ext){
    switch(ext){
        case "mp3": return "mp3";

        case "ogg":
        case "oga": return "oga";

        case "m4a":
        case "mp4":
        case "aac": return "m4a";
        
        case "flac" : return "flac"

        case "wav": return "wav";

        case "weba": return "webma";
    }
}


/******************
PLAYLIST MANAGEMENT
******************/
function savePlaylistAndHideDialog(){
    "use strict";
    var name = $('#playlisttitle').val();
    var pub = $('#playlistpublic').attr('checked')?true:false;
    if(name.trim() !== ''){
        var pl = playlistManager.newPlaylistFromEditing();
        savePlaylist(pl.id,name,pub);
        $('#saveplaylistmodal').modal('hide');
    }
    $(this).blur();
    return false;
}

function savePlaylist(plid,playlistname,ispublic,overwrite){
    "use strict";
    var pl = playlistManager.getPlaylistById(plid);
    overwrite = Boolean(overwrite);
    ispublic = ispublic || pl.public;
    playlistname = playlistname || pl.name;
    var success = function(){
        playlistManager.getPlaylistById(plid).name = playlistname;
        playlistManager.getPlaylistById(plid).public = ispublic;
        playlistManager.getPlaylistById(plid).saved = true;
        playlistManager.refresh();
        playlistManager.showPlaylist(plid);
    }
    busy('#playlist-panel').hide().fadeIn('fast');
    api('saveplaylist',
        {
            'playlist':pl.jplayerplaylist.playlist,
            'public':ispublic,
            'playlistname':playlistname,
            'overwrite':overwrite,
        },
        success,
        errorFunc('error saving playlist'),
        function(){busy('#playlist-panel').fadeOut('fast')});
}
function getAddrPort(){
    m = (window.location+"").match(/https?:\/\/(.+?):?(\d+).*/);
    return 'http://'+m[1]+':'+m[2];
}

function ord(c)
{
  return c.charCodeAt(0);
}

function showPlaylists(){
    "use strict";
    var success = function(data){
        var addressAndPort = getAddrPort();
        new MediaBrowser('.search-results', data);
    };
    var error = errorFunc('error loading external playlists');

    busy('#playlist-panel').hide().fadeIn('fast');
    api('showplaylists',
        success,
        error,
        function(){busy('#playlist-panel').fadeOut('fast')}
    );
}

function changePlaylist(plid,attrname,value){
    window.console.log(plid);
    window.console.log(attrname);
    window.console.log(value);
    busy('#playlist-panel').hide().fadeIn('fast');
    api('changeplaylist',
        {
            'plid' : plid,
            'attribute' : attrname,
            'value' : value
        },
        function(){
            showPlaylists();
        },
        errorFunc('error changing playlist attribute'),
        function(){busy('#playlist-panel').fadeOut('fast')}
    );
}

function confirmDeletePlaylist(id,title){
    $('#deletePlaylistConfirmButton').off();
    $('#deletePlaylistConfirmButton').on('click', function(){
        busy('#playlist-panel').hide().fadeIn('fast');
        api('deleteplaylist',
            {'playlistid':  id},
            false,
            errorFunc('error deleting playlist'),
            function(){busy('#playlist-panel').fadeOut('fast')}
        );
        $('#dialog').fadeOut('fast');
        showPlaylists();
    });
    $('#deleteplaylistmodalLabel').html(Mustache.render('Really delete Playlist "{{title}}"',{title:title}));
    $('#deleteplaylistmodal').modal('show');
}

function loadPlaylist(playlistid, playlistlabel){
    var success = function(data){
        var tracklist = data;
        //transform tracks to jplayer format:
        //TODO rewrite jplayer playlist to support CM-music entry format
        var jplayerplaylist = [];
        for(var i=0; i<tracklist.length; i++){
            jplayerplaylist.push({
                'title':tracklist[i].label,
                'url':  tracklist[i].urlpath
            });
        }
        var pl = playlistManager.newPlaylist(jplayerplaylist, playlistlabel);
    }
    api('loadplaylist',
        {'playlistid': playlistid},
        success,
        errorFunc('error loading external playlist'),
        function(){busy('#playlist-panel').fadeOut('fast')}
    )
}

function loadPlaylistContent(playlistid, playlistlabel){
    "use strict";
    var pldomid = "#playlist"+playlistid+' .playlistcontent';
    if('' === $(pldomid).html().trim()){
        var success = function(data){
            new MediaBrowser(pldomid, data, playlistlabel);
        };
        busy('#playlist-panel').hide().fadeIn('fast');
        api('loadplaylist',
            {'playlistid': playlistid},
            success,
            errorFunc('error loading external playlist'),
            function(){busy('#playlist-panel').fadeOut('fast')}
        );
    } else {
        $(pldomid).slideToggle('slow');
    }
}

var lastPlaylistHeight = 0;
function resizePlaylistSlowly(){
    var currentHeight = $('.jp-playlist').height();
    if(lastPlaylistHeight <= currentHeight){
        $('#playlistContainerParent').animate({'min-height': currentHeight});
    }
    lastPlaylistHeight = currentHeight;
}

function download_editing_playlist(){
    var pl = playlistManager.getEditingPlaylist();
    var p = pl.jplayerplaylist.playlist;
    var track_urls = []
    for(i=0; i<p.length; i++){
        track_urls.push(htmldecode(p[i].url.slice(6)));
    }
    var tracks_json = JSON.stringify(track_urls)
    api('downloadcheck',
        {'filelist': tracks_json},
        function(msg){
            if(msg == 'ok'){
                //add tracks to hidden form and call to call download using post data
                $('#download-redirect-files').val(tracks_json);
                $('#download-redirect').submit();
            } else {
                alert(msg);
            }
        },
        errorFunc('Failed to check if playlist may be downloaded')
    );
}

/*****
OTHER
*****/

function reloadPage(){
    //reconstruct url to suppress page reload post-data warning
    var reloadurl = window.location.protocol+'//'+window.location.host;
    window.location.href = reloadurl;
}

function logout(){
    "use strict";
    api('logout', reloadPage);
}

/** TEMPLATES **/
function TemplateLoader(template_path){
    this.template_path = template_path;
    this.loaded_templates = {};
    var self = this;
    this.get = function(template_name, callback){
        if(this.loaded_templates.hasOwnProperty(template_name)){
            callback(this.loaded_templates[template_name]);
        } else {
            $.get(
                this.template_path+'/'+template_name+'.html',
                function(data){
                    self.loaded_templates[template_name] = data;
                    callback(self.loaded_templates[template_name]);
                }
            );
        }
    }
    this.render = function(template_name, content, $jqobj){
        this.get(template_name, function(template){
            $jqobj.html(Mustache.render(template, content));
        });
    }
}
var templateLoader = new TemplateLoader('res/templates');

/***
ADMIN PANEL
***/

function updateUserList(){
    "use strict";
    var success = function(data){
        var htmllist = "";
        var response = $.parseJSON(data);
        var time = response['time'];
        var template_user_data = {'users': []};
        $.each(response['userlist'],function(i,e){           
            var reltime = time - e.last_time_online;
            template_user_data['users'].push({
                isadmin: e.admin,
                may_download: e.may_download,
                isnotadmin: !e.admin,
                isdeletable: e.deletable,
                userid: e.id,
                isonline: reltime < HEARTBEAT_INTERVAL_MS/500,
                username: e.username,
                username_color: userNameToColor(e.username),
                fuzzytime: time2text(reltime),
            });
        });
        templateLoader.get('user-list', function(template){
            $('#adminuserlist').html(Mustache.render(template, template_user_data));
        });
    };
    busy('#adminuserlist').hide().fadeIn('fast');
    api('getuserlist',
        success,
        errorFunc('cannot fetch user list'),
        function(){busy('#adminuserlist').fadeOut('fast')}
    );
}
function addNewUser(){
    "use strict";
    var newusername = $('#newusername').val();
    var newpassword = $('#newpassword').val();
    var newisadmin = $('#newisadmin').attr('checked')?1:0;
    if(newusername.trim() === '' || newpassword.trim() === ''){
        return;
    }
    var success = function(data){
        $('#newusername').val('');
        $('#newpassword').val('');
        $('#newisadmin').prop('checked', false);
        updateUserList();
    };
    busy('#adminpanel').hide().fadeIn('fast');
    api('adduser',
        {
            'username':newusername,
            'password':newpassword,
            'isadmin':newisadmin
        },
        success,
        errorFunc('failed to add new user'),
        function(){busy('#adminpanel').fadeOut('fast')}
    );
}

function userDelete(userid){
    var success = function(data){
        updateUserList();
    };
    busy('#adminuserlist').hide().fadeIn('fast');
    api('setuseroptionfor',
        { 'userid':userid },
        success,
        errorFunc('failed to delete user'),
        function(){ busy('#adminuserlist').fadeOut('fast') }
    );
}

function userSetPermitDownload(userid, allow_download){
    var success = function(data){
        updateUserList();
    };
    busy('#adminuserlist').hide().fadeIn('fast');
    api('setuseroptionfor',
        {
            'optionkey': 'media.may_download',
            'optionval': allow_download,
            'userid': userid,
        },
        success,
        errorFunc('Failed to set user download state'),
        function(){busy('#adminuserlist').fadeOut('fast')}
    );
}

function userChangePassword(){
    if (! validateNewPassword($('#newpassword-change'), $('#repeatpassword-change'))) {
        return false;
    }
    $('#oldpassword-change').val('');
    var success = function(data){
        $('#changePassword').find('input').each(function(idx, el) { $(el).val(''); } )
        $('#changePassword').modal('hide');
        $('#userOptions').modal('hide');
        successNotify('Password changed successfully!')();
    };
    var error = function(){
        $('#oldpassword-change').focus();
        $("#changePassword").modal('attention');
    }
    busy('#adminpanel').hide().fadeIn('fast');
    api('userchangepassword',
        {
            'oldpassword':$('#oldpassword-change').val(),
            'newpassword':$('#newpassword-change').val()
        },
        success,
        error,
        function(){busy('#adminpanel').fadeOut('fast')}
    );
}
function validateNewPassword($newpwfield, $repeatpwfield){
    var newpw = $newpwfield.val();
    var repeatpw = $repeatpwfield.val();
    if (newpw == repeatpw) {
        $repeatpwfield.closest('.control-group').removeClass('error')
        return true;
    }
    $repeatpwfield.closest('.control-group').addClass('error')
    return false;
}

function enableJplayerDebugging(){
    $('#jplayer_inspector').jPlayerInspector({jPlayer:$('#jquery_jplayer_1'),visible:true});
    $('#jquery_jplayer_1').data().jPlayer.options.errorAlerts = true;
    $('#jquery_jplayer_1').data().jPlayer.options.warningAlerts = true;
    $('#jplayer_inspector_update_0').click();
}

function loadBrowser(){
    var success = function(data){
        new MediaBrowser('.search-results', data, 'Root');
    };
    busy('#searchfield').hide().fadeIn('fast');
    api('listdir',
        success,
        errorFunc('failed to load file browser'),
        function(){busy('#searchfield').fadeOut('fast')});
}

/***
HELPER
***/

function endsWith(str, suffix) {
    "use strict";
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}
function getFileTypeByExt(filepath){
    "use strict";
    var extmatch = filepath.match(/.*?\.(\w+)$/);
    if(extmatch){
        return extmatch[1].toLowerCase();
    }
}

function detectBrowser(){
    var browsers = ['midori','firefox','msie','chrome','safari','opera']
    for(var i=0; i<browsers.length; i++){
        if(navigator.userAgent.toLowerCase().indexOf(browsers[i])!=-1){
            return browsers[i];
        }
    }
    return 'unknown';
}

/*****
 * UTIL
 * ***/
function unixtime(){
    var d = new Date;
    return parseInt(d.getTime() / 1000);
}

function time2text(sec){
    var abssec = Math.abs(sec);
    var minutes = parseInt(abssec/60);
    var hours = parseInt(minutes/60)
    var days = parseInt(hours/24);
    var weeks = parseInt(days/7);
    var months = parseInt(days/30);
    var years = parseInt(months/12);
    var t='';
    if(abssec < 30){
        return 'just now'
    } else {
        if(years != 0){
            years+' years';
            if(years > 20){
                return 'never';
            }
        } else if(months != 0){
            t = months+' months';
        } else if(weeks != 0){
            t = weeks+' weeks';
        } else if(days != 0){
            t = days+' days';
        } else if(hours != 0){
            t = hours == 1 ? 'an hour' : hours+' hours';
        } else if(minutes != 0){
            t = minutes > 25 ? 'half an hour' : minutes+' minutes';
            if (minutes == 1){
                t = 'a minute';
            }
        } else {
            t = 'a few seconds'
        }
        return sec > 0 ? t+' ago' : 'in '+t;
    }
}

/*****************
 * KEYBOARD SHORTCUTS
 * ***************/
function initKeyboardshortcuts(){
    $(window.document).bind('keydown', keyboardShortcuts);
    //disable space bar scrolling
    $(document).keydown(function (e) {
        var focusedElement = $("*:focus");
        var inputFieldFocused = focusedElement.length > 0;
        var key = e.charCode ? e.charCode : e.keyCode ? e.keyCode : 0;
        if (key === 32 && !inputFieldFocused) e.preventDefault();
    });
}
function keyboardShortcuts(e){
    //we don't want to ruin all the nice standard shortcuts.
    if (e.altKey) return;
    if (e.shiftKey) return;
    if (e.ctrlKey) return;
    if (e.metaKey) return;
    var focusedElement = $("*:focus");
    var inputFieldFocused = focusedElement.length > 0;
    if(inputFieldFocused){
        if(e.which === 27){ //escape -> unfocus
            focusedElement.blur();
        }
    } else {
        var actions = { 'next' :    function(e){playlistManager.cmd_next()},
                        'pause' :   function(e){playlistManager.cmd_pause()},
                        'play' :    function(e){playlistManager.cmd_play()},
                        'prev' :    function(e){playlistManager.cmd_previous()},
                        'search' :  function(e){$('#searchform input').focus().select(); e.preventDefault();},
                        'stop' :    function(e){playlistManager.cmd_stop()},
                        };
        for(var action in actions){
            if(e.which === userOptions.keyboard_shortcuts[action]){
                window.console.log('triggering: '+action);
                actions[action](e);
            }
        }
        if(e.which === 32){
            window.console.log('triggering: pause');
            actions['pause']();
        }
    }
}

function sendHeartBeat(){
    api('heartbeat',
        function(){ /*removeError('connection to server lost') */ },
        errorFunc('connection to server lost'),
        true)
    window.setTimeout('sendHeartBeat()', HEARTBEAT_INTERVAL_MS);
}

function userOptionCheckboxListener(htmlid, optionname){
    $(htmlid).on('change',function(){
        optionSetter(   optionname,
                        $(this).attr('checked')=='checked',
                        function(){
                            $(this).attr('checked',userOptions[optionname])
                        },
                        errorFunc('Error setting option! '+optionname)
        );
    });
}

/*****************************
CONDITIONAL USER INTERFACE 
 *****************************/

function show_ui_conditionally(selectors, conditions_table){
    var conditions_met = [];
    for(var condition_name in conditions_table){
        if(conditions_table.hasOwnProperty(condition_name)){
            if(conditions_table[condition_name]){
                conditions_met.push(condition_name);
            }
        }
    }
    //support for single string as first argument
    if(!selectors instanceof Array){
        selectors = [selectors];
    }
    for(var i=0; i<selectors.length; i++){
        //check all buttons for their show conditions and hide/show them
        $(selectors[i]+' > [show-cond]').each(function(i, e){
            var ui_element = $(e);
            var conditions_needed = ui_element.attr('show-cond').split(' ');
            ui_element.show();
            $.each(conditions_needed, function(i, e){
                if(conditions_met.indexOf(e) < 0){
                    ui_element.hide();
                    return false;
                }
            });
        });
    }
}

/***
ON DOCUMENT READY... STEADY... GO!
***/
var playlistManager;
$(document).ready(function(){
    "use strict";
    $('#playlistBrowser').hide();
    loadConfig(function(){
        playlistManager = new PlaylistManager();
        $('#username-label').text('('+loggedInUserName+')');
    });
    loadUserOptions(initKeyboardshortcuts);    
    api('getmotd',function(data){$('#oneliner').text(data)},
        errorFunc('could not fetch message of the day'));
    window.onscroll = MediaBrowser.static.albumArtLoader; //enable loading of images when in viewport
    
    //register top level directories
    $('div#progressscreen').fadeOut('slow');
    //window.setInterval("resizePlaylistSlowly()",2000);
    $('#searchform .searchinput').focus();
    sendHeartBeat();
    $('#adminpanel').on('shown.bs.modal', function (e) {
        updateUserList();
    });
    $('#save-playlist-from-queue').on('click',function(){
        $('#playlisttitle').val('');
        $("#playlistpublic").attr("checked", true);
    });
    $('#saveplaylistmodal').on('shown.bs.modal',function(){
        $('#playlisttitle').focus();
        $('#playlisttitle').bind('keyup',function(e){
            if(e.which === 13) { //enter
                savePlaylistAndHideDialog();
            } else if(e.which === 27){ //escape
                $('#saveplaylistmodal').modal('hide');
            }
        });
    });
    $('#saveplaylistmodal').on('hide', function(){
        $('#playlisttitle').unbind('keyup');
    });
    $('#changePassword').on('show.bs.modal', function(){
        $('#changePassword').data('modal').options.focusOn = '#oldpassword-change';
    });
    
    userOptionCheckboxListener('#misc-show_playlist_download_buttons',
                               'misc.show_playlist_download_buttons');
    userOptionCheckboxListener('#misc-autoplay_on_add',
                               'misc.autoplay_on_add');
});
