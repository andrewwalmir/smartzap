export const webhookFixtures = {
    // 1. Text Message Real Inbound Payload
    inboundText: {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "109312345678901",
                changes: [
                    {
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5511999999999",
                                phone_number_id: "109312345678901",
                            },
                            contacts: [
                                {
                                    profile: {
                                        name: "Customer Name",
                                    },
                                    wa_id: "5511988888888",
                                },
                            ],
                            messages: [
                                {
                                    from: "5511988888888",
                                    id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUM0U0M0YwREFEQTBGMTE3OUM5NDcA",
                                    timestamp: "1710260400",
                                    text: {
                                        body: "Hello, I want to schedule an appointment",
                                    },
                                    type: "text",
                                },
                            ],
                        },
                        field: "messages",
                    },
                ],
            },
        ],
    },

    // 2. Status Update: Sent -> Delivered -> Read
    statusSent: {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "109312345678901",
                changes: [
                    {
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5511999999999",
                                phone_number_id: "109312345678901",
                            },
                            statuses: [
                                {
                                    id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUM0U0M0YwREFEQTBGMTE3OUM5NDcA",
                                    status: "sent",
                                    timestamp: "1710260401",
                                    recipient_id: "5511988888888",
                                },
                            ],
                        },
                        field: "messages",
                    },
                ],
            },
        ],
    },

    statusDelivered: {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "109312345678901",
                changes: [
                    {
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5511999999999",
                                phone_number_id: "109312345678901",
                            },
                            statuses: [
                                {
                                    id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUM0U0M0YwREFEQTBGMTE3OUM5NDcA",
                                    status: "delivered",
                                    timestamp: "1710260405",
                                    recipient_id: "5511988888888",
                                },
                            ],
                        },
                        field: "messages",
                    },
                ],
            },
        ],
    },

    statusRead: {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "109312345678901",
                changes: [
                    {
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5511999999999",
                                phone_number_id: "109312345678901",
                            },
                            statuses: [
                                {
                                    id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUM0U0M0YwREFEQTBGMTE3OUM5NDcA",
                                    status: "read",
                                    timestamp: "1710260410",
                                    recipient_id: "5511988888888",
                                },
                            ],
                        },
                        field: "messages",
                    },
                ],
            },
        ],
    },

    // 3. Status Update: Failed
    statusFailed: {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "109312345678901",
                changes: [
                    {
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5511999999999",
                                phone_number_id: "109312345678901",
                            },
                            statuses: [
                                {
                                    id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUM0U0M0YwREFEQTBGMTE3OUM5NDcA",
                                    status: "failed",
                                    timestamp: "1710260415",
                                    recipient_id: "5511988888888",
                                    errors: [
                                        {
                                            code: 131026,
                                            title: "Message undeliverable",
                                            message: "Message undeliverable",
                                            error_data: {
                                                details: "Message failed to deliver due to user block."
                                            }
                                        }
                                    ]
                                },
                            ],
                        },
                        field: "messages",
                    },
                ],
            },
        ],
    },

    // 4. Invalid Payload / Partial Empty Structure
    invalidMissingEntry: {
        object: "whatsapp_business_account",
        entry: []
    },

    // 5. Interactive Message: Button Reply
    inboundButtonReply: {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "109312345678901",
                changes: [
                    {
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5511999999999",
                                phone_number_id: "109312345678901",
                            },
                            contacts: [
                                {
                                    profile: {
                                        name: "Customer Name",
                                    },
                                    wa_id: "5511988888888",
                                },
                            ],
                            messages: [
                                {
                                    context: {
                                        from: "5511999999999",
                                        id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUM0U0M0YwREFEQTBGMTE3OUM5NDcA",
                                    },
                                    from: "5511988888888",
                                    id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUMTExMTEzY2UzMjRiNTc4OQ==",
                                    timestamp: "1710260500",
                                    type: "interactive",
                                    interactive: {
                                        type: "button_reply",
                                        button_reply: {
                                            id: "btn_confirm_appointment",
                                            title: "Confirmar Agendamento",
                                        },
                                    },
                                },
                            ],
                        },
                        field: "messages",
                    },
                ],
            },
        ],
    },

    // 6. Interactive Message: List Reply
    inboundListReply: {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "109312345678901",
                changes: [
                    {
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5511999999999",
                                phone_number_id: "109312345678901",
                            },
                            contacts: [
                                {
                                    profile: {
                                        name: "Customer Name",
                                    },
                                    wa_id: "5511988888888",
                                },
                            ],
                            messages: [
                                {
                                    context: {
                                        from: "5511999999999",
                                        id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUM0U0M0YwREFEQTBGMTE3OUM5NDcA",
                                    },
                                    from: "5511988888888",
                                    id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUMTExMTEzY2UzMjRiNTc4OQ==",
                                    timestamp: "1710260600",
                                    type: "interactive",
                                    interactive: {
                                        type: "list_reply",
                                        list_reply: {
                                            id: "service_haircut",
                                            title: "Corte de Cabelo",
                                            description: "45 min"
                                        },
                                    },
                                },
                            ],
                        },
                        field: "messages",
                    },
                ],
            },
        ],
    },

    // 7. Interactive Message: NFM Reply (WhatsApp Flows)
    inboundFlowReply: {
        object: "whatsapp_business_account",
        entry: [
            {
                id: "109312345678901",
                changes: [
                    {
                        value: {
                            messaging_product: "whatsapp",
                            metadata: {
                                display_phone_number: "5511999999999",
                                phone_number_id: "109312345678901",
                            },
                            contacts: [
                                {
                                    profile: {
                                        name: "Customer Name",
                                    },
                                    wa_id: "5511988888888",
                                },
                            ],
                            messages: [
                                {
                                    context: {
                                        from: "5511999999999",
                                        id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUM0U0M0YwREFEQTBGMTE3OUM5NDcA",
                                    },
                                    from: "5511988888888",
                                    id: "wamid.HBgLNTUxMTk4ODg4ODg4FQIAEhgUMTExMTEzY2UzMjRiNTc4OQ==",
                                    timestamp: "1710260700",
                                    type: "interactive",
                                    interactive: {
                                        type: "nfm_reply",
                                        nfm_reply: {
                                            name: "flow_name_123",
                                            response_json: "{\"flow_token\":\"campaign_token_abc\",\"selected_date\":\"2026-12-12\",\"selected_service\":\"Consultation\"}"
                                        },
                                    },
                                },
                            ],
                        },
                        field: "messages",
                    },
                ],
            },
        ],
    }
};
