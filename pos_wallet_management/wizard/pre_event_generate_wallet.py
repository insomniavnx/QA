# -*- coding: utf-8 -*-
#################################################################################
#
#   Copyright (c) 2016-Present Webkul Software Pvt. Ltd. (<https://webkul.com/>)
#   See LICENSE file for full copyright and licensing details.
#   License URL : <https://store.webkul.com/license.html/>
# 
#################################################################################

from odoo import models, api, fields, _
from odoo.exceptions import UserError

class GenerateBulkWallet(models.TransientModel):
    _name = 'generate.bulk.wallet'
    _description = 'Generate wallets in bulk.'

    no_of_wallets = fields.Integer('Number of Wallets to be generated',required="1")
   
    def generate_wallets(self):
        if self.no_of_wallets > 0:
            for number in range(self.no_of_wallets):
                self.env['pos.wallet'].create({'wk_pre_event_wallet':True,})

            view_action = self.env.ref('pos_wallet_management.pos_pre_event_wallet_action_window').read()[0]
            return view_action

        raise UserError(_('You cannot generate wallets when number of wallets is less than or equal to zero.'))
        
 



