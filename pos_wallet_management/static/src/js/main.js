/* Copyright (c) 2016-Present Webkul Software Pvt. Ltd. (<https://webkul.com/>) */
/* See LICENSE file for full copyright and licensing details. */
/* License URL : <https://store.webkul.com/license.html/> */
odoo.define('pos_wallet_management.pos_wallet_management', function(require){
"use strict";
    var pos_model = require('point_of_sale.models');
    var rpc = require('web.rpc')
    var PosDB = require('point_of_sale.DB');
    const ClientLine = require('point_of_sale.ClientLine');
    var core = require('web.core');
    var _t = core._t;
    var utils = require('web.utils');
    var round_di = utils.round_decimals;
    var SuperPaymentline = pos_model.Paymentline.prototype;
    var SuperOrder = pos_model.Order.prototype;
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const PosComponent = require('point_of_sale.PosComponent');
    const ClientListScreen = require('point_of_sale.ClientListScreen');
    const PaymentScreen = require('point_of_sale.PaymentScreen');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const SuperPaymentScreen = PaymentScreen.prototype;
    const { Gui } = require('point_of_sale.Gui');
    var model_list = pos_model.PosModel.prototype.models;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    var journal_model = null;
    pos_model.load_fields('pos.payment.method','wallet_method');
    pos_model.load_fields('res.partner',['wallet_credits','wallet_id']);

    //--Fetching model dictionary--
    for(var i = 0,len = model_list.length;i<len;i++){
        if(model_list[i].model == "pos.payment.method"){
            journal_model = model_list[i];
            break;
        }
    }

    //--Searching wallet journal--
    var super_journal_loaded = journal_model.loaded;
    journal_model.loaded = function(self, journals){
        super_journal_loaded.call(this,self,journals);
        journals.forEach(function(journal){
            if(journal.wallet_method){
                self.db.wallet_method = journal;
                return true;
            }
        });
    };

    // --set wallet product----
    PosDB.include({
	    add_products: function(products){
            var self = this;
           for(var i = 0, len = products.length; i < len; i++){
                if(products[i].default_code == 'wk_wallet'){
                    products[i].not_returnable = true;
                    self.wallet_product = products[i];
                }
           }
            self._super(products)
        }
    });

    const PosProductScreen = (ProductScreen) =>
        class extends ProductScreen {
        mounted() {
            var current_order = this.env.pos.get_order();
            super.mounted();
            if (current_order != null && current_order.wallet_recharge_data) {
                $('.product').css("pointer-events", "none");
                $('.product').css("opacity", "0.4");
                $('.header-cell').css("pointer-events", "none");
                $('.header-cell').css("opacity", "0.4");
                $('.numpad-backspace').css("opacity", "0.4");
                $('.numpad-backspace').css("pointer-events", "none");
                $('.numpad-backspace').css("opacity", "0.4");
                $('.numpad .mode-button[data-mode~="quantity"]').css("pointer-events", "none");
                $('.numpad .mode-button[data-mode~="quantity"]').css("opacity", "0.4");
                $('.numpad .mode-button[data-mode~="price"]').css("pointer-events", "none");
                $('.numpad .mode-button[data-mode~="price"]').css("opacity", "0.4");
                $('.numpad .mode-button[data-mode~="discount"]').css("pointer-events", "none");
                $('.numpad .mode-button[data-mode~="discount"]').css("opacity", "0.4");
            } else {
                $('.product').css("pointer-events", "");
                $('.product').css("opacity", "");
                $('.header-cell').css("pointer-events", "");
                $('.header-cell').css("opacity", "");
                $('.numpad-backspace').css("opacity", "");
                $('.numpad-backspace').css("pointer-events", "");
                $('.numpad-backspace').css("opacity", "");
                $('.numpad .mode-button[data-mode~="quantity"]').css("pointer-events", "");
                $('.numpad .mode-button[data-mode~="quantity"]').css("opacity", "");
                $('.numpad .mode-button[data-mode~="price"]').css("pointer-events", "");
                $('.numpad .mode-button[data-mode~="price"]').css("opacity", "");
                $('.numpad .mode-button[data-mode~="discount"]').css("pointer-events", "");
                $('.numpad .mode-button[data-mode~="discount"]').css("opacity", "");
            }
        }
    }
    Registries.Component.extend(ProductScreen, PosProductScreen);

// ---load wallet model---------------------
    pos_model.load_models([{
		model: 'pos.wallet',
		fields: ['name','partner_id','amount','wk_pre_event_wallet','wk_barcode'],
		domain: function(self){
			return [['state','=','confirm'],['wk_pre_event_wallet','=',false]]
		},
		loaded: function(self,wallets){
            wallets = wallets.sort(function(a,b){
                return b.id - a.id;
            });
            self.db.all_wallets = wallets;
            self.wk_pre_event_wallet = wallets.wk_pre_event_wallet;
            self.db.wallet_by_name = {};
            self.db.wallet_by_id = {};
            wallets.forEach(function(wallet){
                self.db.wallet_by_name[wallet.wk_barcode] = wallet;
                self.db.wallet_by_id[wallet.id] = wallet;
            })
		}
	}])

    pos_model.Paymentline = pos_model.Paymentline.extend({
        initialize: function(attributes, props){
            this.is_wallet_payment_line = false;
            SuperPaymentline.initialize.call(this, attributes, props);
        },
    });

    class WkErrorNotifyPopopWidget extends AbstractAwaitablePopup {
        mounted(){
            super.mounted();
            setTimeout(function(){
                $('.move').addClass('complete');
            },500)
        }
    }
    WkErrorNotifyPopopWidget.template = 'WkErrorNotifyPopopWidget';
    WkErrorNotifyPopopWidget.defaultProps = { title: 'Confirm ?', body: '' };
    Registries.Component.add(WkErrorNotifyPopopWidget);

    class CreateWalletPopopWidget extends AbstractAwaitablePopup {
        mounted(){
            var self = this;
            super.mounted();
			setTimeout(function(){
				$('.move').addClass('complete');
			},500)
            $('.create_wallet').css({'pointer-events':'all'});
        }
        click_create_wallet(){
           var self = this;
           if(self.props && self.props.partner){
                var partner = self.props.partner;
                $('.button.create_wallet').css({'pointer-events':'none'})
                rpc.query({
					model:'pos.wallet',
					method:'create_wallet_by_rpc',
					args:[{'partner_id':parseInt(partner.id)}]
				})
                .then(function(result){
                    partner.wallet_id = [result.id,result.name];
                    var wallet_details = result;
                    wallet_details['partner_id']=[partner.id,partner.name];
                    wallet_details['partner']= self.props.partner;
                    if($('.client-line.highlight .wallet_credits').length)
                        $('.client-line.highlight .wallet_credits').text(self.env.format_currency(0));
                    else{
                        let client_line = $($('.client-line')[$('.client-line').length-1]);
                        let data_id = client_line.data('id');
                        let partner = self.env.pos.db.get_partner_by_id(data_id);
                        client_line.ch
                        if (partner && partner.wallet_id){
                            client_line.click();
                            client_line.children('.wallet_credits').text(self.env.format_currency(partner.wallet_credits));
                        }
                    }
                  
                    self.env.pos.db.wallet_by_name[result.wk_barcode] = wallet_details;
                    self.env.pos.db.wallet_by_id[result.id] = wallet_details;
                    self.env.pos.db.all_wallets.push(wallet_details);

                    $('.wk_confirm_mark').hide();
                    $('.wallet_status').css({'display': 'inline-block'});
                    $('#order_sent_status').hide();
                    $('.wallet_status').removeClass('order_done');
                    $('.show_tick').hide();
                    setTimeout(function(){
                        $('.wallet_status').addClass('order_done');
                        $('.show_tick').show();
                        $('#order_sent_status').show();
                        $('.wallet_status').css({'border-color':'#5cb85c'});
                        $('.wk-alert center h2').text("Wallet Created !!!!!");

                    },500)
                    setTimeout(function(){
                            self.showPopup('WkWalletRechargePopup',{'partner':partner, 'wallet': result});
                    },1000);
                    $('.recharge_wallet').show();
                    $('.create_wallet').hide();
                    $('.use_pre_printed_wallet').hide();

                    //download pdf of QR/Barcode report
                    self.env.pos.do_action('pos_wallet_management.event_wallet_template_report',{additional_context:{ 
                        active_ids:[result.id],
                    }})  
                
                })
                .catch(function(error) {
                    console.log("error",error)
                    self.showPopup('WkErrorNotifyPopopWidget', {
                        title: _t('Failed To create wallet'),
                        body: _t('Please make sure you are connected to the network.You can also try to refresh the POS.'),
                    });
                })
           }
        }
        click_use_pre_printed_wallet(ev){
            var self = this;
            if(self.props){
                var partner = self.props.partner;
            }
            if(partner){
                self.showPopup('WkUsePreEventWalletPopup',{'is_payment_line':false,'partner':partner});
            }
        }
    }
    CreateWalletPopopWidget.template = 'CreateWalletPopopWidget';
    CreateWalletPopopWidget.defaultProps = { title: 'Confirm ?', body: '' };
    Registries.Component.add(CreateWalletPopopWidget);

    class WkWalletNotifyTickPopupWidget extends AbstractAwaitablePopup {
        mounted(){
            super.mounted();
            var self = this;
            setTimeout(function(){
              self.cancel();
            },2000)
        }
    }
    WkWalletNotifyTickPopupWidget.template = 'WkWalletNotifyTickPopupWidget';
    WkWalletNotifyTickPopupWidget.defaultProps = {body:''};
    Registries.Component.add(WkWalletNotifyTickPopupWidget);

    class WkUsePreEventWalletPopup extends AbstractAwaitablePopup {
        mounted(){
            var self = this;
            $('.barcode_value').focus();
        }
        click_wk_redeem_recharge(ev){
            var self = this;
            var current_order = self.env.pos.get_order();
            var wallet = self.env.pos.db.wallet_by_id[current_order.redeem_wallet_id];
            if(wallet){
                var partner = self.env.pos.db.get_partner_by_id(wallet.partner_id[0]) ;
            }
            if (partner){
                self.showPopup('WkWalletRechargePopup',{'partner':partner, 'wallet': wallet});
            }else{
                self.showPopup('WkErrorNotifyPopopWidget', {
                    title: _t('Failed To Recharge'),
                    body: _t('Please make sure you are connected to the network.You can also try to refresh the POS.'),
                });
            }
        }
        wk_add_wallet_paymentline(ev){
            var self = this;
            self.wk_redeem_amount = $('.wk_redeem_value').val();
            var paymentMethod = self.env.pos.db.wallet_method
            var current_order = self.env.pos.get_order();
            var partner = current_order.get_client()
            var wallet = self.env.pos.db.wallet_by_id[current_order.redeem_wallet_id]
            if(wallet.state== "confirm"){
                if(current_order.redeem_wallet_id && wallet){
                    var barcode = wallet.wk_barcode;
                }
                if( self.env.pos.db.wallet_by_name[barcode]){
                    self.env.pos.db.wallet_by_name[barcode].amount -=  self.wk_redeem_amount
                }
                if(self.wk_redeem_amount){
                    if(self.wk_redeem_amount <= self.props.amount){
                        current_order.add_paymentline(paymentMethod);
                        var selected_paymentline = current_order.selected_paymentline;
                        if(selected_paymentline){
                            selected_paymentline.set_amount(0);
                            var payment_amount = self.wk_redeem_amount;
                            selected_paymentline.set_amount(payment_amount);
                            selected_paymentline.is_wallet_payment_line = true;
                        }
                        self.cancel()
                    }else{
                        self.showPopup('WkErrorNotifyPopopWidget', {
                            title: _t('Error'),
                            body: _t('Redeem amount cannot be greater than wallet amount. Please try again.'),
                        });
                    }
                }else{
                    self.showPopup('WkErrorNotifyPopopWidget', {
                        title: _t('Error'),
                        body: _t('Please enter the redeem amount to proceed.'),
                    });
                }
            }else if(wallet.state== "draft"){
                self.showPopup('WkErrorNotifyPopopWidget', {
                    title: _t('Inactive Wallet'),
                    body: _t('This wallet is inactive. Please try again.'),
                });
            }
        }
        wk_data_save_to_db(res,barcode){
            var self = this;
            var data = {
                'amount':res.amount,
                'id':res.wallet_id,
                'name':res.name,
                'partner_id':res.partner_id,
                'wk_barcode':res.wk_barcode,
                'wk_pre_event_wallet': false,
                'state':res.state
            }
            if(data){
                self.env.pos.db.wallet_by_name[barcode] = data;
                self.env.pos.db.wallet_by_id[res.wallet_id] = data;
                if(res.partner && res.partner.partner &&  self.env.pos.db.partner_by_id[res.partner.partner.id]){
                    self.env.pos.db.partner_by_id[res.partner.partner.id].wallet_id = [res.wallet_id,res.wk_barcode];
                }
                self.env.pos.db.all_wallets.push(data);
            }
        }

        wk_click_pre_event_proceed(ev){
            var self  = this;
            var barcode = $(".barcode_value").val();
            rpc.query({
                model:'pos.wallet',
                method:'check_barcode_exists',
                args:[{'barcode':barcode,'partner':self.props.partner}]
            })
            .then(function(res){
                if (res.wallet_id && !res.same_partner && !res.no_wallet_found){
                    setTimeout(function(){
                        $('.pre_event.wallet_status').addClass('wk_pre_circle');
                        $('.tick_pre_event.show_tick').show();
                        $('.pre_event.wallet_status').css({'display': 'inline-block'});
                        $('.pre_event.wallet_status').css({'border-color':'#5cb85c'});
                        $('.wk-alert center h2').text("Wallet Created !!!!!");
                    },500)
                    self.wk_data_save_to_db(res,barcode)
                    if(!self.props.is_payment_line){
                        self.showPopup('WkWalletNotifyTickPopupWidget', {
                            title: _t('Success!!'),
                            body: _t('Wallet is now linked with the selected partner successfully!!!'),
                            close_popup:true,
                        });
                        setTimeout(function(){
                            Gui.showPopup('WkWalletRechargePopup',{'partner':self.props.partner, 'wallet': res});
                        },2000);
                        self.env.pos.do_action('pos_wallet_management.event_wallet_template_report',{additional_context:{ 
                            active_ids:[res.wallet_id],
                        }})  
                    }else{
                        self.showPopup('WkErrorNotifyPopopWidget', {
                            title: _t('Failed To find wallet'),
                            body: _t('Please make sure you are connected to the network.'),
                        });
                    }   
                }else if (res.another_partner_linked){
                    self.showPopup('WkErrorNotifyPopopWidget', {
                        title: _t('Error'),
                        body: _t('This wallet already has an another partner linked with it. Please try again.'),
                    });
                }else if(res.same_partner){
                    if(self.props.is_payment_line){
                        self.props.amount = res.amount;
                        $('.wk_wallet_text').hide();
                        $('.barcode_value').hide();
                        $('.wk_proceed_btn').hide();
                        $('.wk_redeem_payment').show();
                        $('.wk_wallet_amt').text(self.props.amount);
                        self.props.wk_wallet_amount = self.props.amount;
                        self.env.pos.get_order().redeem_wallet_id =  res.wallet_id;
                        self.wk_data_save_to_db(res,barcode);
                    }else{
                        self.wk_data_save_to_db(res,barcode);
                        Gui.showPopup('WkWalletRechargePopup',{'partner':self.props.partner, 'wallet': res});
                    }
                }else if (res.no_wallet_found){
                    self.showPopup('WkErrorNotifyPopopWidget', {
                        title: _t('Wallet Not Found'),
                        body: _t('Wallet with this barcode either does not exists or is cancelled. Please try again.'),
                    });
                }else{
                    self.showPopup('WkErrorNotifyPopopWidget', {
                        title: _t('Failed To find wallet'),
                        body: _t('Please make sure you are connected to the network.'),
                    });
                }
            }).catch(function(error){
                console.log("error:",error)
                self.showPopup('WkErrorNotifyPopopWidget', {
                    title: _t('Failed To find wallet'),
                    body: _t('Please make sure you are connected to the network.'),
                });
            })
        }
    }
    WkUsePreEventWalletPopup.template = 'WkUsePreEventWalletPopup';
    WkUsePreEventWalletPopup.defaultProps = { title: 'Confirm ?', body: '' };
    Registries.Component.add(WkUsePreEventWalletPopup);

    class WkWalletRechargePopup extends AbstractAwaitablePopup {
        mounted(){
            var self = this;
            super.mounted();
			setTimeout(function(){
				$('.move').addClass('complete');
            },500)
            $('.rechage_amount').attr('placeholder',"Amount ("+self.env.pos.currency.symbol+")")
            $('.rechage_amount').focus();
            $('.partner_name_wk').show();
          
        }
        wk_validate_recharge(){
            var self = this;
            if(self.props && self.props.partner){
                    var recharge_amount = parseFloat($('.rechage_amount').val());
                    var reason = $('.recharge_reason').val();
                    if(recharge_amount<=0 || !recharge_amount){
                        $('.rechage_amount').removeClass('text_shake');
                        $('.rechage_amount').focus();
                        $('.rechage_amount').addClass('text_shake');
                        return;
                    }
                    else if(reason == ""){
                        $('.recharge_reason').removeClass('text_shake');
                        $('.recharge_reason').focus();
                        $('.recharge_reason').addClass('text_shake');
                        return;
                    } else {
                        var wallet_product = self.env.pos.db.wallet_product;
                        var wallet = self.props.wallet.id || self.props.wallet.wallet_id;
                        rpc.query({
                            model:'pos.wallet',
                            method:'check_wallet_state',
                            args:[{'wallet_id':wallet}]
                        })
                        .then(function(res){
                            if(res.state == "cancel"){
                                self.showPopup('WkErrorNotifyPopopWidget', {
                                    title: _t('Failed To Proceed'),
                                    body: _t('This wallet is cancelled. Please try again with another wallet.')
                                });
                            }else if(res.state == "confirm"){
                                if(wallet_product){
                                    var trans_data = {};
                                    trans_data.amount = recharge_amount;
                                    trans_data.trans_reason = reason;
                                    trans_data.created_by = parseInt(self.env.pos.cashier ? self.env.pos.cashier.id : self.env.pos.user.id);
                                    trans_data.partner_id = parseInt(self.props.partner.id);
                                    if(self.props.partner){
                                        trans_data.wallet_id = self.props.wallet.wallet_id;
                                    }
                                    trans_data.payment_type = 'CREDIT';
                                    trans_data.wallet_product_id = wallet_product.id;
                                    trans_data.state = 'confirm'
                                    self.env.pos.add_new_order();
                                    var curren_order = self.env.pos.get_order();
                                    curren_order.wallet_recharge_data = trans_data;
                                    curren_order.add_product(wallet_product, {quantity: 1, price: recharge_amount });
                                    curren_order.set_client(self.props.partner);
                                    if(self.props.wallet && self.props.wallet.partner){
                                        curren_order.wk_recharge_barcode = self.props.wallet.partner.barcode;
                                    }
                                    if (self.props.wallet){
                                        curren_order.recharged_wallet_id = self.props.wallet.id || self.props.wallet.wallet_id;
                                    }  
                                    self.cancel();
                                    self.trigger('close-temp-screen');
                                    self.showScreen('PaymentScreen');
                                    curren_order.save_to_db();
                                } else {
                                    self.showPopup('WkErrorNotifyPopopWidget', {
                                        title: _t('Failed To Recharge Wallet.'),
                                        body: _t('No wallet product is available in POS.'),
                                    });
                                }
                            }else{
                                self.showPopup('WkErrorNotifyPopopWidget', {
                                    title: _t('Inactive Wallet'),
                                    body: _t('This wallet is inactive. Please try again.'),
                                });
                            }
                          
                        }).catch(function(error){
                            console.log("error:",error)
                            self.showPopup('WkErrorNotifyPopopWidget', {
                                title: _t('Failed To find wallet'),
                                body: _t('Please make sure you are connected to the network.'),
                            });
                        });
                    }
                }
        }
    }
    WkWalletRechargePopup.template = 'WkWalletRechargePopup';
    WkWalletRechargePopup.defaultProps = { title: 'Confirm ?', body: '' };
    Registries.Component.add(WkWalletRechargePopup);

    class MainWalletRechargePopup extends AbstractAwaitablePopup {
        mounted(){
            var self = this;
            super.mounted();
			setTimeout(function(){
				$('.move').addClass('complete');
			},500);
            $('.wallet_input').focus();
            self.index = -1;
			self.parent = $('.wallet-holder');
        }
        wallet_key_press_input(event){
            var self = this;
			var updown_press;
			var all_wallets = self.env.pos.db.all_wallets;
			$('.wallet-holder ul').empty();
			var search = $('.wallet_input').val();
			$('.wallet-holder').show();
			search = new RegExp(search.replace(/[^0-9a-z_]/i), 'i');
			for(var index in all_wallets){
				if(all_wallets[index].name.match(search)){
			   	    $('.wallet-holder ul').append($("<li><span class='wallet-name'>" + all_wallets[index].wk_barcode + "</span></li>"));
				}
			}
            if($('.wallet-holder')[0] && $('.wallet-holder')[0].style.display !="none")
                $('.wallet_details').hide();

			$('.wallet-holder ul').show();
			$('.wallet-holder li').on('click', function(){
				var quotation_id = $(this).text();
				$(".wallet_input").val(quotation_id);
                $('.wallet-holder').hide();
                $(".wallet_input").blur();
			});
			if(event.which == 38){
				// Up arrow
				self.index--;
				var len = $('.wallet-holder li').length;
				if(self.index < 0)
					self.index = len-1;
				self.parent.scrollTop(36*self.index);
				updown_press = true;
			}else if(event.which == 40){
				// Down arrow
				self.index++;
				if(self.index > $('.wallet-holder li').length - 1)
					self.index = 0;
				self.parent.scrollTop(36*self.index);
			   	updown_press = true;
			}
			if(updown_press){
				$('.wallet-holder li.active').removeClass('active');
				$('.wallet-holder li').eq(self.index).addClass('active');
				$('.wallet-holder li.active').select();
			}

			if(event.which == 27){
				// Esc key
				$('.wallet-holder ul').hide();
			}else if(event.which == 13 && self.index >=0 && $('.wallet-holder li').eq(self.index)[0]){
				var selcted_li_wallet_id = $('.wallet-holder li').eq(self.index)[0].innerText;
				$(".wallet_input").val(selcted_li_wallet_id);
                $('.wallet-holder ul').hide();
				$('.wallet-holder').hide();
				self.index = -1;
                $('.wallet_input').focusout();

			}
        }
        click_validate_wallet(){
            var self = this;
            var wallet_input = $('.wallet_input').val();
            if(wallet_input && self.env.pos.db.wallet_by_name[wallet_input]){
                var wallet = self.env.pos.db.wallet_by_name[wallet_input];
                var partner = self.env.pos.db.get_partner_by_id(wallet.partner_id[0]);
                if(!partner && wallet.partner){
                    partner = wallet.partner.partner || wallet.partner;
                }
                if (partner){
                    self.showPopup('WkWalletRechargePopup',{'partner':partner, 'wallet': wallet});
                }
            }
            else{
                $('.wallet_input').addClass('text_shake')
                setTimeout(function(){
                    $('.wallet_input').removeClass('text_shake');
                },500);
            }
        }
        click_transfer_money_wallet(){
            var self = this;
            var wallet_input = $('.wallet_input').val();
            if(wallet_input && self.env.pos.db.wallet_by_name[wallet_input]){
                var wallet = self.env.pos.db.wallet_by_name[wallet_input];
                var partner = self.env.pos.db.get_partner_by_id(wallet.partner_id[0]);
                if(!partner && wallet.partner){
                    partner = wallet.partner.partner || wallet.partner
                }
                if (partner){
                    self.showPopup('WkPreEventWalletTransferPopup',{'partner':partner,'wallet':wallet});
                }
            }
            else{
                $('.wallet_input').addClass('text_shake')
                setTimeout(function(){
                    $('.wallet_input').removeClass('text_shake');
                },500);
            }
        }
    }
    MainWalletRechargePopup.template = 'MainWalletRechargePopup';
    MainWalletRechargePopup.defaultProps = { title: 'Confirm ?', body: '' };
    Registries.Component.add(MainWalletRechargePopup);
    
    class WkPreEventWalletTransferPopup extends PosComponent {
        mounted(){
            super.mounted();
        }
        wk_transfer_money(ev){
            var self = this;
            rpc.query({
                model:'pos.wallet',
                method:'check_wallet_state',
                args:[{'wallet_id':self.props.wallet.id}]
            })
            .then(function(res){
                if(res.state=="cancel"){
                    self.showPopup('WkErrorNotifyPopopWidget', {
                        title: _t('Failed To Proceed'),
                        body: _t('This wallet is cancelled. Please try again with another wallet.')
                    });
                }else if(res.state == "confirm"){
                    if(self.props && self.props.partner){
                        if (self.props.wallet && (self.props.wallet.amount > 0)){
                            var rechage_amount = parseFloat($('.rechage_amount').val());
                            var reason = $('.recharge_reason').val();
                            var wallet_product = self.env.pos.db.wallet_product;
                            if(rechage_amount <= self.props.wallet.amount){
                                if(wallet_product){
                                    var trans_data = {};
                                    trans_data.amount = rechage_amount;
                                    trans_data.trans_reason = reason;
                                    trans_data.redeem_wallet_id = self.env.pos.get_order().redeem_wallet_id;
                                    trans_data.created_by = parseInt(self.env.pos.cashier ? self.env.pos.cashier.id : self.env.pos.user.id);
                                    trans_data.partner_id = parseInt(self.props.partner.id);
                                    trans_data.wallet_id = parseInt(self.props.wallet.id);
                                    trans_data.payment_type = 'DEBIT';
                                    rpc.query({
                                        model:'pos.wallet',
                                        method:'create_debit_transaction',
                                        args:[{'trans_data':trans_data}]
                                    })
                                    .then(function(result){
                                        if (result){
                                            self.env.pos.db.wallet_by_name[self.props.wallet.wk_barcode].amount -= rechage_amount
                                            self.showPopup('WkErrorNotifyPopopWidget', {
                                                title: _t('Wallet Transfer Succesfull'),
                                                body: _t('Wallet transfer of '+self.env.pos.format_currency(rechage_amount) +' is successful.'),
                                            });
                                        } else {
                                            self.showPopup('WkErrorNotifyPopopWidget', {
                                                title: _t('Failed To create wallet'),
                                                body: _t('Please make sure you are connected to the network.'),
                                            });
                                        }
                                    })
                                    .catch(function(unused, event) {
                                        self.showPopup('WkErrorNotifyPopopWidget', {
                                            title: _t('Failed To create wallet'),
                                            body: _t('Please make sure you are connected to the network.'),
                                        });
                                    })
                                } else {
                                    self.showPopup('WkErrorNotifyPopopWidget', {
                                        title: _t('Failed To Transfer Money.'),
                                        body: _t('No wallet product is available in POS.'),
                                    });
                                }

                            }else{
                                self.showPopup('WkErrorNotifyPopopWidget', {
                                    title: _t('Failed To Transfer Money.'),
                                    body: _t('The transfer amount cannot be greater than the wallet amount.'),
                                });
                            }
                        } else {
                            self.showPopup('WkErrorNotifyPopopWidget', {
                                title: _t('Failed To Transfer Money.'),
                                body: _t('Insufficient Wallet Amount.'),
                            });
                        }
                    }
                }else{
                    self.showPopup('WkErrorNotifyPopopWidget', {
                        title: _t('Inactive Wallet'),
                        body: _t('This wallet is inactive. Please try again.')
                    });
                }
            }).catch(function(error){
                console.log("error:",error)
                self.showPopup('WkErrorNotifyPopopWidget', {
                    title: _t('Failed To find wallet'),
                    body: _t('Please make sure you are connected to the network.'),
                });
            });
        }
        cancel(){
            this.trigger('close-popup');
        }
    }
    WkPreEventWalletTransferPopup.template = 'WkPreEventWalletTransferPopup';
    WkPreEventWalletTransferPopup.defaultProps = { title: 'Confirm ?', body: '' };
    Registries.Component.add(WkPreEventWalletTransferPopup);
    
    class WalletRechargeWidget extends PosComponent {
        async onClick() {
            if(this.env.pos.db.wallet_method)
                this.showPopup("MainWalletRechargePopup",{});
            else
                this.showPopup('WkErrorNotifyPopopWidget',{
                    title: _t('Payment Method  For Wallet Not Found'),
                    body: _t('Please check the backend configuration. No payment method for wallet is available'),
                });
        }
    }
    WalletRechargeWidget.template = 'WalletRechargeWidget';
    Registries.Component.add(WalletRechargeWidget);

    const PosResClientListScreen = (ClientListScreen) =>
        class extends ClientListScreen{
            mounted(){
                var self = this;
                var current_order = self.env.pos.get_order();
                super.mounted();
                if(current_order != null && current_order.wallet_recharge_data){
                    if(self.is_wallet_orderline())
                        self.back();
                    else
                        current_order.wallet_recharge_data = null;
                }
            }
    // -------------------check item cart contain wallet product or not------------
            is_wallet_orderline(){
                var self = this;
                var current_order = self.env.pos.get_order();
                var wallet_line = false;
                if(current_order.get_orderlines() && self.env.pos.db.wallet_product){
                    current_order.get_orderlines().forEach(function(orderline){
                        if(orderline.product.id == self.env.pos.db.wallet_product.id)
                            wallet_line = true;
                    });
                }
                return wallet_line;
            }
        }
    Registries.Component.extend(ClientListScreen, PosResClientListScreen);

    const PosResClientLine = (ClientLine) =>
        class extends ClientLine{
            recharge_wallet(){
                var self = this;
                if(self.env.pos.db.wallet_method){
                    self.showPopup('WkUsePreEventWalletPopup',{'is_payment_line':false,'partner':this.props.partner});
                } else {
                    self.showPopup('WkErrorNotifyPopopWidget',{
                        title: _t('Payment Method  For Wallet Not Found'),
                        body: _t('Please check the backend configuration. No payment method for wallet is available'),
                    });
                }
            }
            create_wallet(){
                var self = this;
                if(self.env.pos.db.wallet_method)
                    self.showPopup('CreateWalletPopopWidget',{
                        'partner':this.props.partner,
                        'title':'No Wallet For Selected Customer',
                        'body':'You need to create a wallet for this customer before you can proceed to recharge'
                    })
                else
                    self.showPopup('WkErrorNotifyPopopWidget',{
                        title: _t('Payment Method  For Wallet Not Found'),
                        body: _t('Please check the backend configuration. No payment method for wallet is available'),
                    });
            }
        }
    Registries.Component.extend(ClientLine, PosResClientLine);

    const PosWechatPaymentScreen = (PaymentScreen) =>
    class extends PaymentScreen {
        _updateSelectedPaymentline() {
            var self = this;
            super._updateSelectedPaymentline();
            var current_order = self.env.pos.get_order();
            var client = current_order.get_client();
            var input = NumberBuffer.get();
            if($.isNumeric(input)){
                var selected_paymentline = current_order.selected_paymentline;
                if(selected_paymentline && selected_paymentline.is_wallet_payment_line){
                    var input_amount = selected_paymentline.amount;
                    selected_paymentline.amount = 0;
                    var due_amount = current_order.get_due();
                    var wallet_credits = client.wallet_credits;
                    var set_this_amount = Math.min(due_amount, wallet_credits, input_amount);
                    current_order.selected_paymentline.set_amount(set_this_amount);
                    self.inputbuffer = set_this_amount.toString();
                    self.render();
                    $('.paymentline.selected .edit').text(self.env.pos.format_currency_no_symbol(set_this_amount));
                    $('div.wallet_balance').html("Balance: <span style='color: #247b45;font-weight: bold;'>" + self.env.pos.format_currency(client.wallet_credits-set_this_amount) + "</span>");
                }
            }else if (input == "BACKSPACE") {
                var selected_paymentline = current_order.selected_paymentline;
                if(selected_paymentline && selected_paymentline.is_wallet_payment_line){
                    var input_amount = selected_paymentline.amount;
                    $('.paymentline.selected .edit').text(self.env.pos.format_currency_no_symbol(set_this_amount));
                    $('div.wallet_balance').html("Balance: <span style='color: #247b45;font-weight: bold;'>" + self.env.pos.format_currency(client.wallet_credits-input_amount) + "</span>");
                }
            }
        }

        check_existing_wallet_line(){
            var self = this;
            var current_order = self.env.pos.get_order();
            var existing_wallet_line = null;
            var paymentlines = current_order.get_paymentlines();
            if (self.env.pos.db.wallet_method){
                paymentlines.forEach(function(line){
                    if(line.payment_method.id == self.env.pos.db.wallet_method.id){
                        line.is_wallet_payment_line = true;
                        existing_wallet_line = line;
                        return true;
                    }
                });
            }
            return existing_wallet_line;
        }

        addNewPaymentLine({ detail: paymentMethod }) {
            var self = this;
            var current_order = self.env.pos.get_order();
            var client = current_order.get_client();
            var due = current_order.get_due();
            if(paymentMethod.wallet_method){
                if(client && client.wallet_credits > 0){
                    var selected_paymentline = null;
                    if(due > 0){
                        super.addNewPaymentLine({ detail: paymentMethod });
                        selected_paymentline = current_order.selected_paymentline;
                    }
                    if(selected_paymentline){
                        selected_paymentline.set_amount(0);
                        due = current_order.get_due();
                        var payment_amount = Math.min(due, client.wallet_credits);
                        selected_paymentline.set_amount(payment_amount);
                        selected_paymentline.is_wallet_payment_line = true;
                    }
                }
                else if(!client){
                    const { confirmed } = this.showPopup('ConfirmPopup', {
                        title: this.env._t('Please select the Customer'),
                        body: this.env._t('You need to select the customer before using wallet payment method.'),
                    });
                    if (confirmed) {
                        // SuperPaymentScreen.selectClient.call(self);
                        const currentClient = self.currentOrder.get_client();
                        const { confirmed, payload: newClient } = self.showTempScreen(
                            'ClientListScreen',
                            { client: currentClient }
                        );
                        if (confirmed) {
                            self.currentOrder.set_client(newClient);
                            self.currentOrder.updatePricelist(newClient);
                        }
                        return false;
                    }
                }
                else if(client && !client.wallet_id){
                    self.showPopup('WkErrorNotifyPopopWidget',{
							title: _t('No Wallet For Selected Customer'),
							body: _t('Please configure/create a wallet from backend for the selected customer.'),
						});
                }
            }else
                        super.addNewPaymentLine({ detail: paymentMethod });
                        // this._super(id);
        }

        click_payment_qr_barcode(){
            var self = this;
            var partner = self.env.pos.get_order().get_client();
            if(partner){
                self.showPopup('WkUsePreEventWalletPopup',{'amount':0.0,'is_payment_line':true,'partner':partner});
            }else{
                self.showPopup('WkErrorNotifyPopopWidget',{
                    title: _t('No partner'),
                    body: _t('Please select a partner to redeem wallet.'),
                });
            }
        }
        mounted(){
            var self = this;
            super.mounted();
            var current_order = self.env.pos.get_order();
            var client = current_order.get_client();
        }

        update_walletline_balance(pline){
            var self = this;
            var order = self.env.pos.get_order();
            var client = self.env.pos.get_order().get_client();
            if(client.wallet_credits >0){
                order.select_paymentline(pline);
                var pline_amount =  pline.amount;
                pline.set_amount(0);
                var due = self.env.pos.get_order().get_due();
                var payment_amount = Math.min(due, pline_amount, client.wallet_credits);
                pline.set_amount(payment_amount);
                pline.is_wallet_payment_line = true;
                self.render();
                $('.paymentline.selected .edit').text(self.env.pos.format_currency_no_symbol(payment_amount));
                $('#use_wallet_payment').prop('checked', true);
                $('div.wallet_balance').html("Balance: <span style='color: #247b45;font-weight: bold;'>" + self.env.pos.format_currency(client.wallet_credits-payment_amount) + "</span>");
            } else {
                order.remove_paymentline(pline);
                NumberBuffer.reset();
                self.render();
            }
        }
        hide_wallet_payment_method(){
            var self = this;
            var current_order= self.env.pos.get_order();
            if(current_order && self.env.pos.db.wallet_method){
                var wallet_method_id = self.env.pos.db.wallet_method.id;
                var find_string = '[data-id=' + wallet_method_id.toString() + ']';
                var wallet_paymentmethods = ($('.paymentmethods').find(find_string)[0]);
                if(current_order && current_order.wallet_recharge_data && self.env.pos.db.wallet_method ||!(current_order && current_order.get_client() && current_order.get_client().wallet_credits ) )
                    $(wallet_paymentmethods).hide();
                else
                     $(wallet_paymentmethods).show();
            }
        }
        show_wallet_payment_method(){
            var self = this;
            var wallet_method_id = self.env.pos.db.wallet_method.id;
            var find_string = '[data-id=' + wallet_method_id.toString() + ']';
            var wallet_paymentmethods = ($('.paymentmethods').find(find_string)[0]);
            if (wallet_paymentmethods)
                $(wallet_paymentmethods).show();
        }
    // ------update customer wallet balance--------------------
        async validateOrder(isForceValidate) {
            var self = this;
            var current_order= self.env.pos.get_order();
            super.validateOrder(isForceValidate);
            if(current_order.is_paid()){
                if(current_order && current_order.wallet_recharge_data && self.env.pos.db.wallet_product){
                    var orderline = current_order.get_orderlines();
                    var partner = current_order.get_client();
                    var amount = 0.0;
                    current_order.get_orderlines().forEach(function(orderline){
                        if(orderline.product.id == self.env.pos.db.wallet_product.id){
                            amount = amount + parseFloat(orderline.get_display_price());
                        }
                    });
                    // partner.wallet_credits = round_di(parseFloat(partner.wallet_credits) + amount,3);
                    var wallet_names = self.env.pos.db.wallet_by_name;
                    for (let i in wallet_names) {
                        if(wallet_names[i].id == current_order.recharged_wallet_id){
                            wallet_names[i].amount += amount;
                        }
                    }

                }
                else if(current_order && self.env.pos.db.wallet_method && current_order.get_client()){
                    var plines = current_order.get_paymentlines();
                    var amount = 0.0;
                    var partner = current_order.get_client();
                    plines.forEach(function(pline){
                        if(pline.payment_method.id == self.env.pos.db.wallet_method.id){
                            amount = amount + parseFloat(pline.amount);
                        }
                    });
                    // partner.wallet_credits = round_di(parseFloat(partner.wallet_credits) - amount,3);
                }
            }
        }
    }
    Registries.Component.extend(PaymentScreen, PosWechatPaymentScreen);

    pos_model.Order = pos_model.Order.extend({
        init_from_JSON: function(json) {
            var self = this;
            SuperOrder.init_from_JSON.call(self,json);
            this.recharged_wallet_id = json.recharged_wallet_id || false;
            this.redeem_wallet_id = json.redeem_wallet_id || false;
            if(json.wallet_recharge_data)
                self.wallet_recharge_data = json.wallet_recharge_data;
        },
        initialize: function(attributes,props){
            var self = this;
            self.wallet_recharge_data = null;
            SuperOrder.initialize.call(this,attributes,props);
            self.recharged_wallet_id = self.recharged_wallet_id || false;
            self.redeem_wallet_id = self.redeem_wallet_id || false;
        },
        export_as_JSON: function() {
            var self = this;
            var loaded=SuperOrder.export_as_JSON.call(this);
            var current_order = self.pos.get_order();
            if(current_order!=null){
                loaded.wallet_recharge_data = current_order.wallet_recharge_data;
            }
            if (self.recharged_wallet_id)
                loaded.recharged_wallet_id = self.recharged_wallet_id;
            if (self.redeem_wallet_id)
            loaded.redeem_wallet_id = self.redeem_wallet_id;
            return loaded;
        },
        remove_paymentline: function(line){
            var self = this;
            if(line && line.is_wallet_payment_line){
                $('#use_wallet_payment').prop('checked', false);
                if(self.pos.get_order().get_client())
                    $('div.wallet_balance').html("Balance: <span style='color: #247b45;font-weight: bold;'>" + self.pos.format_currency(self.pos.get_order().get_client().wallet_credits) + "</span>");
            }
            SuperOrder.remove_paymentline.call(this, line);
        },
        set_client: function(client){
            SuperOrder.set_client.call(this,client);
            if (this.pos.get_order()){
                this.pos.get_order().remove_paymentline(this.check_existing_wallet_line());
            }
        },
        check_existing_wallet_line:function(){
            var self = this;
            var current_order = self.pos.get_order();
            var existing_wallet_line = null;
            var paymentlines = current_order.get_paymentlines();
            if (self.pos.db.wallet_method){
                paymentlines.forEach(function(line){
                    if(line.payment_method.id == self.pos.db.wallet_method.id){
                        line.is_wallet_payment_line = true;
                        existing_wallet_line = line;
                        return true;
                    }
                });
            }
            return existing_wallet_line;
        },
        add_product: function(product, props){
            var self = this;
            if(self.pos.db.wallet_product && product.id == self.pos.db.wallet_product.id && !self.pos.get_order().wallet_recharge_data){
                self.showPopup("MainWalletRechargePopup");
            }
            else
                SuperOrder.add_product.call(self,product,props);
        },
        wallet_remaining_balance: function(){
            var self = this;
            var paymentlines = self.pos.get_order().get_paymentlines();
            var line_amount = 0;
            if (self.pos.db.wallet_journal){
                paymentlines.forEach(function(line){
                    if(line.cashregister.journal.id == self.pos.db.wallet_journal.id){
                        line_amount += line.amount;
                    }
                });
            }
            var remianing_amount = self.get_client().wallet_credits - line_amount
            return remianing_amount.toFixed(2)
        }
    });
});
