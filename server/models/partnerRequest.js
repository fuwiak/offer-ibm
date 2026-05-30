const prisma = require("../utils/prisma");

const PartnerRequest = {
  async create({ company, email, country = null, message = null }) {
    return prisma.partner_requests.create({
      data: { company, email, country, message },
    });
  },
};

module.exports = { PartnerRequest };
