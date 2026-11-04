import { Injectable, NotFoundException } from '@nestjs/common';
import { Product } from '@app/contracts';

@Injectable()
export class ProductsService {
  private readonly products: Product[] = [
    { id: 1, name: 'Sample Product', price: 9.99 },
    { id: 2, name: 'Keyboard', price: 49.99 },
    { id: 3, name: 'Mouse', price: 19.99 },
  ];

  findAll(): Product[] {
    return this.products;
  }

  findOne(id: number): Product {
    const product = this.products.find((product) => product.id === id);

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }

    return product;
  }

}
